import pandas as pd
from typing import Dict, Any
from sqlalchemy.orm import Session
from models import TbImportAcData

def process_epa_ac_data(df: pd.DataFrame, db: Session) -> Dict[str, Any]:
    """
    Process raw epaAC data according to ingestion logic:
    1. Filter Valid Cases
    2. Handle Duplicates
    3. Generate Metadata (Provenance, Quality, Anomalies)
    4. Database Sync
    """
    
    # 1. Filter Valid Cases
    required_cols = ['FallID', 'PID', 'Einschätzung']
    for col in required_cols:
        if col not in df.columns:
            return {"status": "error", "message": f"Missing required column: {col}"}
    
    # Drop rows where critical identifying info is completely missing (NA)
    filtered_df = df.dropna(subset=required_cols).copy()
    
    # 2. Handle Duplicates
    # If multiple records exist for the same IID, keep only the last one
    if 'IID' in filtered_df.columns:
        filtered_df = filtered_df.drop_duplicates(subset=['FallID', 'PID', 'IID'], keep='last')
        
    records_to_insert = []
    
    # Identify null-like strings for Quality Metrics
    null_indicators = {'null', 'missing', 'unknow', 'unknown', 'nan', 'none', ''}
    
    for idx, row in filtered_df.iterrows():
        # Quality Metrics: check SID_value
        raw_sid = str(row.get('SID_value', '')).strip()
        is_missing = raw_sid.lower() in null_indicators
        
        mapped_sid_value = None if is_missing else raw_sid
        
        # Anomaly Detection
        is_anomaly = False
        if not is_missing:
            try:
                num_val = float(mapped_sid_value)
                # Assuming 1-4 scale, flag if outside
                if num_val < 1.0 or num_val > 4.0:
                    is_anomaly = True
            except ValueError:
                # Value is likely categorical/string; ignore range check
                pass
                
        # Provenance Metadata
        provenance_station = str(row.get('Station', 'Unknown'))
        provenance_account = str(row.get('Account', 'Unknown'))
        
        # Build Database Model
        record = TbImportAcData(
            FallID=str(row['FallID']),
            PID=str(row['PID']),
            Einschaetzung=pd.to_datetime(row['Einschätzung']) if pd.notnull(row['Einschätzung']) else None,
            IID=str(row.get('IID', '')) if pd.notnull(row.get('IID')) else None,
            Kuerzel=str(row.get('Kürzel', '')) if pd.notnull(row.get('Kürzel')) else None,
            SID_value=mapped_sid_value,
            Provenance_Station=provenance_station,
            Provenance_Account=provenance_account,
            Quality_Is_Null=1 if is_missing else 0,
            Anomaly_Flag=1 if is_anomaly else 0
        )
        
        records_to_insert.append(record)
        
    # Database Sync
    if records_to_insert:
        db.add_all(records_to_insert)
        db.commit()
        
    return {
        "status": "success",
        "processed_rows": len(records_to_insert),
        "anomalies_flagged": sum(1 for r in records_to_insert if r.Anomaly_Flag),
        "nulls_flagged": sum(1 for r in records_to_insert if r.Quality_Is_Null)
    }
