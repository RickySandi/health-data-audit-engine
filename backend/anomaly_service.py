import json
import logging
import datetime
import pandas as pd
from sqlalchemy.orm import Session
from models import Anomaly, DeviceMotionData

logger = logging.getLogger(__name__)

def evaluate_lab_record(case_id: str, lab_record: dict) -> list[Anomaly]:
    """
    Routine 1: Lab Anomalies
    Checks if there's any flag ('H', 'L') or out-of-bounds in the lab record.
    Returns a list of Anomaly objects to be inserted.
    """
    anomalies = []
    tests = [k.replace('_low', '').replace('_ref_low', '') for k in lab_record.keys() if k.endswith('_low') or k.endswith('_ref_low')]
    for test in set(tests):
        val = lab_record.get(test)
        low_val = lab_record.get(f"{test}_low") or lab_record.get(f"{test}_ref_low")
        high_val = lab_record.get(f"{test}_high") or lab_record.get(f"{test}_ref_high")
        
        if pd.notnull(val) and pd.notnull(low_val) and pd.notnull(high_val):
            try:
                num_val = float(val)
                num_low = float(low_val)
                num_high = float(high_val)
                
                if num_val < num_low or num_val > num_high:
                    anomalies.append(
                        Anomaly(
                            case_id=case_id,
                            category="Lab Anomalies",
                            severity_level="High",
                            details=json.dumps({
                                "test_name": test,
                                "value": num_val,
                                "expected_range": f"{num_low} - {num_high}",
                                "message": f"Lab value {num_val} is outside reference range {num_low}-{num_high}."
                            })
                        )
                    )
            except (ValueError, TypeError):
                pass
                
    return anomalies

def evaluate_vital_signs(case_id: str, vital_signs: dict) -> list[Anomaly]:
    """
    Routine 2: Clinical Safety
    Checks for critical vital signs. Example: Heart Rate > 220 or < 30.
    """
    anomalies = []
    
    # Example logic for heart_rate checking
    hr_val = vital_signs.get('heart_rate')
    if hr_val is not None:
        try:
            hr_float = float(hr_val)
            if hr_float > 220 or hr_float < 30:
                anomalies.append(
                    Anomaly(
                        case_id=case_id,
                        category="Clinical Safety",
                        severity_level="High",
                        details=json.dumps({
                            "vital_sign": "Heart Rate",
                            "value": hr_float,
                            "message": "Heart rate out of safe bounds (>220 or <30)"
                        })
                    )
                )
        except (ValueError, TypeError):
            pass

    return anomalies

def evaluate_cross_check_fall(db: Session, case_id: str, text: str) -> list[Anomaly]:
    """
    Routine 3: Cross-Check Logic
    Nurse keyword 'sturz' / 'fall' mapping to device motion event.
    """
    anomalies = []
    text_lower = text.lower()
    if 'fall' in text_lower or 'fell' in text_lower or 'sturz' in text_lower:
        # Check if device motion caught it
        events = db.query(DeviceMotionData).filter(DeviceMotionData.case_id == case_id).all()
        motion_events = [e.event_type.lower() for e in events if e.event_type]
        
        if 'fall' not in motion_events:
            msg = "Note mentions fall, but no corresponding sensor event exists in device module."
            logger.error(f"ANOMALY TRIGGERED [Case {case_id}]: {msg}")
            anomalies.append(
                Anomaly(
                    case_id=case_id,
                    category="Cross-Check",
                    severity_level="High",
                    details=json.dumps({
                        "note_text_snippet": str(text)[0:100],
                        "message": msg
                    })
                )
            )
    return anomalies

def commit_anomalies(db: Session, anomalies: list[Anomaly]):
    """ Helper to persist a list of anomalies """
    if anomalies:
        db.add_all(anomalies)
        db.commit()

def detect_anomalies(db: Session, file_name: str, df: pd.DataFrame) -> int:
    """
    Master function to detect anomalies after data ingestion based on the uploaded file type.
    """
    anomalies = []
    fname = file_name.lower()
    
    if "lab" in fname:
        for _, row in df.iterrows():
            case_id = str(row.get("case_id", ""))
            anomalies.extend(evaluate_lab_record(case_id, row.to_dict()))
            
    elif "vital" in fname:
        for _, row in df.iterrows():
            case_id = str(row.get("case_id", ""))
            anomalies.extend(evaluate_vital_signs(case_id, row.to_dict()))
            
    # For nursing notes, the anomaly cross-check is already hooked inline in nlp_service.py
    
    commit_anomalies(db, anomalies)
    return len(anomalies)
