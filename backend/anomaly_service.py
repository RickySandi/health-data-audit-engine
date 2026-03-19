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

def evaluate_cross_check_datasets(nursing_df: pd.DataFrame, motion_df: pd.DataFrame) -> list[Anomaly]:
    """
    Routine 4: Cross-Check Innovation Service
    Joins synthetic_nursing_daily_reports.csv and synthetic_device_motion_fall_data.csv on patient_id and date.
    Searches for keywords ('sturz', 'fall', 'floor') in nursing text. 
    If keyword found but sensor data shows fall_event_0_1 == 0, generates a 'Sensor Conflict' anomaly.
    """
    anomalies = []
    
    # Normalize column names for safe joining
    # Check what columns nursing df has (patient_id, date, text/report, case_id)
    pat_col_n = next((c for c in nursing_df.columns if c.lower() in ['pid', 'patient_id', 'patientid']), None)
    date_col_n = next((c for c in nursing_df.columns if c.lower() in ['date', 'report_date', 'timestamp']), None)
    case_col_n = next((c for c in nursing_df.columns if c.lower() in ['caseid', 'case_id']), None)
    text_col = next((c for c in nursing_df.columns if c.lower() in ['text', 'report', 'note', 'daily_report']), None)
    
    pat_col_m = next((c for c in motion_df.columns if c.lower() in ['pid', 'patient_id', 'patientid']), None)
    date_col_m = next((c for c in motion_df.columns if c.lower() in ['date', 'report_date', 'timestamp']), None)
    fall_col = next((c for c in motion_df.columns if c.lower() == 'fall_event_0_1'), None)
    
    if not (pat_col_n and pat_col_m and date_col_n and date_col_m and text_col and fall_col):
        logger.error("Missing required columns for cross-check join.")
        return anomalies
        
    # Standardize types for the join keys
    nursing_df[pat_col_n] = nursing_df[pat_col_n].astype(str)
    nursing_df[date_col_n] = pd.to_datetime(nursing_df[date_col_n], errors='coerce').dt.date
    motion_df[pat_col_m] = motion_df[pat_col_m].astype(str)
    motion_df[date_col_m] = pd.to_datetime(motion_df[date_col_m], errors='coerce').dt.date
    
    # Inner join on patient_id and date
    merged = pd.merge(
        nursing_df, motion_df, 
        left_on=[pat_col_n, date_col_n], 
        right_on=[pat_col_m, date_col_m], 
        how='inner',
        suffixes=('_nurs', '_motion')
    )
    
    keywords = ['sturz', 'fall', 'floor']
    
    for index, row in merged.iterrows():
        text = str(row.get(text_col, '')).lower()
        has_keyword = any(kw in text for kw in keywords)
        
        # Check if sensor says 0
        fall_event = row.get(fall_col, 0)
        try:
            fall_event = int(float(fall_event))
        except (ValueError, TypeError):
            fall_event = 0
            
        if has_keyword and fall_event == 0:
            case_id = str(row.get(case_col_n, 'UNKNOWN'))
            msg = "Fall reported in text but missed by motion sensor"
            anomalies.append(
                Anomaly(
                    case_id=case_id,
                    category="Sensor Conflict",
                    severity_level="High",
                    details=json.dumps({
                        "note_text_snippet": str(row.get(text_col, ''))[0:150],
                        "message": msg
                    })
                )
            )
            
    return anomalies

def evaluate_medication_adherence(df: pd.DataFrame) -> tuple[list[Anomaly], float]:
    """
    Routine 5: Medication Adherence Logic
    1. Identify all ORDER records that have no corresponding ADMIN record of status 'given'.
    2. Flag ADMIN records where administration_status is 'missed', 'held', or 'refused'.
    3. If 'missed' dose is for critical medication, trigger High Severity Alert.
    Returns: (anomalies_list, adherence_percentage)
    """
    anomalies = []
    
    pat_col = next((c for c in df.columns if c.lower() in ['pid', 'patient_id', 'patientid']), None)
    ord_id_col = next((c for c in df.columns if c.lower() in ['order_id', 'orderid']), None)
    type_col = next((c for c in df.columns if c.lower() in ['record_type', 'action', 'type']), None)
    status_col = next((c for c in df.columns if c.lower() in ['administration_status', 'status']), None)
    med_col = next((c for c in df.columns if c.lower() in ['medication_name', 'medication', 'drug_name']), None)
    case_col = next((c for c in df.columns if c.lower() in ['case_id', 'caseid']), None)

    if not (ord_id_col and type_col and status_col):
        # We can't map orders without these structural keys.
        return [], 0.0
        
    case_col = case_col or pat_col or ord_id_col # fallback if case_id missing
    
    # Normalize
    df[type_col] = df[type_col].astype(str).str.upper()
    df[status_col] = df[status_col].astype(str).str.lower()
    
    orders = df[df[type_col] == 'ORDER']
    admins = df[df[type_col] == 'ADMIN']
    
    total_orders = len(orders)
    given_admins = len(admins[admins[status_col] == 'given'])
    
    if total_orders == 0:
        adherence = 0.0
    else:
        adherence = (given_admins / total_orders) * 100
        if adherence > 100:
            adherence = 100.0

    critical_keywords = ['heparin', 'apixaban', 'warfarin', 'rivaroxaban', 'enoxaparin', 'anticoagulant']

    # 1. Missing ADMIN for an ORDER
    # Group admins by order_id checking for at least one 'given'
    admin_success = admins[admins[status_col] == 'given'][ord_id_col].unique()
    
    for _, order_row in orders.iterrows():
        o_id = order_row.get(ord_id_col)
        if o_id not in admin_success:
            # Order was not given
            c_id = str(order_row.get(case_col, 'UNKNOWN'))
            med_name = str(order_row.get(med_col, 'Unknown Medication')).lower()
            
            is_critical = any(kw in med_name for kw in critical_keywords)
            sev = "High" if is_critical else "Medium"
            
            anomalies.append(
                Anomaly(
                    case_id=c_id,
                    category="Missed Medication",
                    severity_level=sev,
                    details=json.dumps({
                        "order_id": str(o_id),
                        "medication": med_name,
                        "message": "ORDER record lacks a corresponding ADMIN record with status 'given'."
                    })
                )
            )

    # 2. Flag explicitly missed/held/refused admins
    flagged_statuses = ['missed', 'held', 'refused']
    flagged_admins = admins[admins[status_col].isin(flagged_statuses)]
    
    for _, admin_row in flagged_admins.iterrows():
        c_id = str(admin_row.get(case_col, 'UNKNOWN'))
        med_name = str(admin_row.get(med_col, 'Unknown Medication')).lower()
        stat = str(admin_row.get(status_col))
        
        is_critical = (stat == 'missed' and any(kw in med_name for kw in critical_keywords))
        sev = "High" if is_critical else "Medium"
        
        anomalies.append(
            Anomaly(
                case_id=c_id,
                category=f"Medication {stat.capitalize()}",
                severity_level=sev,
                details=json.dumps({
                    "order_id": str(admin_row.get(ord_id_col)),
                    "medication": med_name,
                    "administration_status": stat,
                    "message": f"Dose was flagged as {stat}."
                })
            )
        )

    return anomalies, round(adherence, 1)

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
