import pandas as pd
import json
import logging
from typing import Dict, Any, List
from sqlalchemy.orm import Session
from models import TbImportNursingDailyReports, DeviceMotionData
from langchain_community.llms import Ollama
from langchain.prompts import PromptTemplate

# Optional spacy import for local extraction if Ollama is not running
try:
    import spacy
    nlp = spacy.load("en_core_web_md")
except Exception:
    nlp = None

logger = logging.getLogger(__name__)

def get_device_events(case_id: str, db: Session) -> List[str]:
    """Retrieve verified sensor events from the device motion table"""
    events = db.query(DeviceMotionData).filter(DeviceMotionData.case_id == case_id).all()
    return [e.event_type.lower() for e in events] if events else []

def extract_with_ollama(text: str) -> dict:
    """Use Langchain + Ollama to parse clinical notes"""
    try:
        llm = Ollama(model="llama3", base_url="http://localhost:11434")
        prompt = PromptTemplate(
            input_variables=["text"],
            template='''
            Extract clinical insights from this nursing note: "{text}". 
            Respond strictly in valid JSON format with these exact keys:
            - "symptoms": list of strings (e.g. pain, fever)
            - "interventions": list of strings
            - "state": string (e.g. Stable, Deteriorating)
            - "urgency": boolean (true if highly critical like a fall or refusing medication, else false)
            '''
        )
        response = llm.invoke(prompt.format(text=text))
        
        # Clean markdown formatting if present
        if response.startswith("```json"):
            response = response.strip("```json").strip("```")
            
        return json.loads(response)
    except Exception as e:
        logger.warning(f"Ollama extraction failed, falling back to spaCy/keywords. Error: {e}")
        return extract_entities_fallback(text)

def extract_entities_fallback(text: str) -> dict:
    """Fallback keyword/spacy based extraction model"""
    text_lower = text.lower()
    
    # 1. Base keyword extraction
    symptoms = []
    interventions = []
    
    if "pain" in text_lower: symptoms.append("pain")
    if "fever" in text_lower: symptoms.append("fever")
    if "nausea" in text_lower: symptoms.append("nausea")
    
    if "medication" in text_lower or "administer" in text_lower:
        interventions.append("medication administration")
        
    urgency = "fall" in text_lower or "fell" in text_lower or "refusing" in text_lower or "critical" in text_lower
    state = "Unstable/At Risk" if urgency else "Stable"
    
    # 2. Enrich with spaCy if available
    if nlp is not None:
        doc = nlp(text)
        symptoms.extend([ent.text for ent in doc.ents if ent.label_ in ['DISEASE', 'SYMPTOM', 'CONDITION']])
        interventions.extend([ent.text for ent in doc.ents if ent.label_ in ['TREATMENT', 'MEDICATION']])
        
    return {
        "symptoms": list(set(symptoms)),
        "interventions": list(set(interventions)),
        "state": state,
        "urgency": urgency
    }

def extract_clinical_insights(df: pd.DataFrame, db: Session, use_ollama: bool = False) -> Dict[str, Any]:
    """
    Process synthetic_nursing_daily_reports.csv:
    - Analyzes NLP entities (symptoms, interventions, urgency)
    - Triggers Anomaly Alerts for unregistered falls
    - Syncs everything into tbImportNursingDailyReports
    """
    required_cols = ['report_id', 'case_id', 'report_date', 'nursing_note_free_text']
    for col in required_cols:
        if col not in df.columns:
            return {"status": "error", "message": f"Missing column: {col}"}
            
    records_to_insert = []
    anomalies_triggered = 0
    high_urgency_count = 0
    
    for _, row in df.iterrows():
        case_id = str(row['case_id'])
        text = str(row['nursing_note_free_text'])
        
        # Entity and Sentiment Extraction
        if use_ollama:
            insights = extract_with_ollama(text)
        else:
            insights = extract_entities_fallback(text)
            
        is_high_risk = insights.get('urgency', False)
        if is_high_risk:
            high_urgency_count += 1
            
        # Anomaly Detection constraint
        has_anomaly = False
        text_lower = text.lower()
        if 'fall' in text_lower or 'fell' in text_lower:
            motion_events = get_device_events(case_id, db)
            
            if 'fall' not in motion_events:
                has_anomaly = True
                anomalies_triggered += 1
                logger.error(f"ANOMALY TRIGGERED [Case {case_id}]: Note mentions fall, but no corresponding sensor event exists in device module.")
                
        record = TbImportNursingDailyReports(
            report_id=str(row['report_id']),
            case_id=case_id,
            report_date=pd.to_datetime(row['report_date']) if pd.notnull(row['report_date']) else None,
            nursing_note_free_text=text,
            extracted_symptoms=json.dumps(insights.get('symptoms', [])),
            extracted_interventions=json.dumps(insights.get('interventions', [])),
            patient_state=insights.get('state', 'Unknown'),
            urgency_flag=1 if is_high_risk else 0,
            anomaly_alert=1 if has_anomaly else 0
        )
        records_to_insert.append(record)
        
    if records_to_insert:
        db.add_all(records_to_insert)
        db.commit()
        
    return {
        "status": "success",
        "processed_reports": len(records_to_insert),
        "high_urgency_flagged": high_urgency_count,
        "anomalies_triggered": anomalies_triggered
    }
