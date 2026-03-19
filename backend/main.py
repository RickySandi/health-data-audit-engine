from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import datetime

app = FastAPI(title="Healthcare Data Mapping MVP")

# Allow CORS for local Angular development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200", "http://localhost", "http://localhost:80"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mocked Logs Memory Store
app_logs = [
    {"timestamp": datetime.datetime.now().isoformat(), "event": "System Initialized", "filename": "N/A", "status": "Success"}
]

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.get("/logs")
def get_logs():
    return app_logs

@app.get("/quality-audit")
def get_quality_audit(filter: str = None):
    if filter == 'missing':
        return [
            {"case_id": "C-1029", "missing_field": "date_of_birth", "source_system": "Kardio-DB", "issue": "NULL Value"},
            {"case_id": "C-1033", "missing_field": "SID_value", "source_system": "Labor-Befunde", "issue": "Missing Value"},
            {"case_id": "C-1041", "missing_field": "epa_code", "source_system": "EHR Export", "issue": "Unrecognized Format 'unknow'"}
        ]
    return []

@app.get("/dashboard-stats")
def get_dashboard_stats():
    import json as _json
    db = SessionLocal()
    try:
        # Total records across all import tables
        from sqlalchemy import func, text
        ac_count  = db.execute(text('SELECT COUNT(*) FROM "tbImportAcData"')).scalar() or 0
        lab_count = db.execute(text('SELECT COUNT(*) FROM "tbImportLabsData"')).scalar() or 0
        nur_count = db.execute(text('SELECT COUNT(*) FROM "tbImportNursingDailyReports"')).scalar() or 0
        total_count = ac_count + lab_count + nur_count

        # Source distribution from import log
        rows = db.query(
            TbImportLog.source_system,
            func.sum(TbImportLog.row_count).label("total")
        ).group_by(TbImportLog.source_system).all()
        source_distribution = [{"name": r.source_system, "value": int(r.total)} for r in rows]

        # Category completeness from import log
        cat_rows = db.query(
            TbImportLog.category,
            func.sum(TbImportLog.row_count).label("total")
        ).group_by(TbImportLog.category).all()
        category_completeness = [{"name": r.category, "value": int(r.total)} for r in cat_rows]

        # Anomaly count (non-dismissed)
        anomaly_count = db.query(Anomaly).filter(Anomaly.status != "Dismissed").count()

        # Unique source systems
        unique_source_systems = db.query(func.count(func.distinct(TbImportLog.source_system))).scalar() or 0

        # Recent imports (last 5)
        recent = db.query(TbImportLog).order_by(TbImportLog.imported_at.desc()).limit(5).all()
        recent_imports = [
            {
                "id": f"H-{r.id:04d}",
                "source": r.source_system,
                "records": r.row_count,
                "status": r.status,
                "imported_at": r.imported_at.isoformat() if r.imported_at else None
            }
            for r in recent
        ]

        return {
            "total_count": total_count,
            "source_distribution": source_distribution,
            "category_completeness": category_completeness,
            "medication_adherence": medication_adherence_stats["percentage"],
            "anomaly_count": anomaly_count,
            "unique_source_systems": unique_source_systems,
            "recent_imports": recent_imports,
        }
    except Exception as e:
        # Tables may not exist yet (first boot before any upload)
        return {
            "total_count": 0,
            "source_distribution": [],
            "category_completeness": [],
            "medication_adherence": medication_adherence_stats["percentage"],
            "anomaly_count": 0,
            "unique_source_systems": 0,
            "recent_imports": [],
        }
    finally:
        db.close()

import os
import pandas as pd
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from pydantic import BaseModel
from fastapi import HTTPException
from anomaly_service import detect_anomalies, commit_anomalies, evaluate_cross_check_datasets, evaluate_medication_adherence
from models import Anomaly, TbImportLabsData, TbImportLog, Base

medication_adherence_stats = {"percentage": 0.0}

class AnomalyUpdate(BaseModel):
    status: str

@app.get("/anomalies")
def get_anomalies():
    db = SessionLocal()
    try:
        anomalies = db.query(Anomaly).order_by(Anomaly.detected_at.desc()).all()
        result = []
        for a in anomalies:
            result.append({
                "id": a.id,
                "case_id": a.case_id,
                "category": a.category,
                "severity_level": a.severity_level,
                "status": a.status,
                "details": a.details,
                "detected_at": a.detected_at.isoformat() if a.detected_at else None
            })
        return result
    finally:
        db.close()

@app.patch("/anomalies/{anomaly_id}")
def update_anomaly_status(anomaly_id: int, update_data: AnomalyUpdate):
    db = SessionLocal()
    try:
        anomaly = db.query(Anomaly).filter(Anomaly.id == anomaly_id).first()
        if not anomaly:
            raise HTTPException(status_code=404, detail="Anomaly not found")
        anomaly.status = update_data.status
        db.commit()
        db.refresh(anomaly)
        return {
            "id": anomaly.id,
            "status": anomaly.status
        }
    finally:
        db.close()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://{}:{}@db:5432/{}".format(
        os.getenv("POSTGRES_USER", "postgres"),
        os.getenv("POSTGRES_PASSWORD", "hackathon_secret"),
        os.getenv("POSTGRES_DB", "health_data"),
    )
)

import time
import urllib.parse
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

def _init_db(max_retries: int = 10, delay: int = 3):
    url = urllib.parse.urlparse(DATABASE_URL)
    db_name = url.path.lstrip('/')
    base_url = DATABASE_URL.replace('/' + db_name, '/postgres')
    for attempt in range(max_retries):
        try:
            conn = psycopg2.connect(base_url)
            conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
            cursor = conn.cursor()
            cursor.execute(f"SELECT 1 FROM pg_catalog.pg_database WHERE datname = '{db_name}'")
            if not cursor.fetchone():
                cursor.execute(f"CREATE DATABASE {db_name}")
            cursor.close()
            conn.close()

            conn2 = psycopg2.connect(DATABASE_URL)
            conn2.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
            cursor2 = conn2.cursor()
            cursor2.execute("CREATE EXTENSION IF NOT EXISTS vector")
            cursor2.close()
            conn2.close()
            print("Database initialised successfully.")
            return
        except Exception as e:
            if attempt < max_retries - 1:
                print(f"DB not ready (attempt {attempt + 1}/{max_retries}): {e} — retrying in {delay}s...")
                time.sleep(delay)
            else:
                print(f"Error initialising database after {max_retries} attempts: {e}")

_init_db()

engine = create_engine(DATABASE_URL)

try:
    Base.metadata.create_all(bind=engine)
except Exception as e:
    if "type \"vector\" does not exist" in str(e) or "UndefinedObject" in str(e):
        print("\n\n*** CRITICAL ERROR ***")
        print("The 'vector' extension is not installed in your Postgres database.")
        print(f"Please run 'CREATE EXTENSION vector;' in the database running on port 5444.")
        print("If you are running locally without Docker pgvector, this app requires the pgvector extension.")
        print("************************\n\n")
    else:
        print(f"Error generating schema: {e}")

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def _classify_import(filename: str, df) -> tuple:
    """Return (source_system, category, status) for a given upload."""
    name = (filename or "").lower()
    if "nursing" in name or "daily_report" in name:
        return ("Freetext Notes", "Nursing Assessments", "Mapped")
    if "lab" in name or "synth_lab" in name:
        return ("Labor-Befunde (PDF)", "Vital Signs", "Mapped")
    if "medication" in name or "medic" in name:
        return ("Kardio-DB (CSV)", "Medications", "Mapped")
    if "motion" in name or "device" in name or "fall" in name:
        return ("Freetext Notes", "Care Assessments", "Mapped")
    # Default / epaAC data
    return ("Kardio-DB (CSV)", "Care Assessments", "Mapped")


@app.post("/map-data")
async def map_data(file: UploadFile = File(...)):
    anomalies_detected = 0
    try:
        # Load the CSV
        df = pd.read_csv(file.file)
        
        # Neutralization: Map 'unknow', 'Missing', and 'N/A' to SQL NULL
        df.replace(['unknow', 'Missing', 'N/A', 'n/a', 'NaN', ' '], None, inplace=True)
        
        # Missing Data: Remove rows missing case_id or patient_id and log this as a 'Critical' anomaly
        case_col = next((c for c in df.columns if c.lower() in ['caseid', 'case_id']), None)
        pat_col = next((c for c in df.columns if c.lower() in ['pid', 'patientid', 'patient_id']), None)
        
        missing_anomalies = []
        if case_col and pat_col:
            missing_mask = df[case_col].isna() | df[pat_col].isna() | (df[case_col] == '') | (df[pat_col] == '')
            missing_df = df[missing_mask]
            
            for index, row in missing_df.iterrows():
                missing_anomalies.append(
                    Anomaly(
                        case_id=str(row.get(case_col)) if pd.notnull(row.get(case_col)) and row.get(case_col) != '' else f"UNKNOWN_ROW_{index}",
                        category="Missing Data",
                        severity_level="Critical",
                        details=json.dumps({
                            "message": f"Row {index} missing CaseID or PID",
                            "raw_data": str(row.to_dict())
                        })
                    )
                )
            
            df = df.dropna(subset=[case_col, pat_col])
        
        # Medication Logic (If this is the medication file)
        med_anomalies = []
        if 'administration_status' in df.columns or 'record_type' in df.columns:
            m_anoms, adher = evaluate_medication_adherence(df)
            med_anomalies = m_anoms
            medication_adherence_stats["percentage"] = adher
        
        # Open DB Session
        import json
        db = SessionLocal()
        try:
            if missing_anomalies:
                commit_anomalies(db, missing_anomalies)
                anomalies_detected += len(missing_anomalies)

            if med_anomalies:
                commit_anomalies(db, med_anomalies)
                anomalies_detected += len(med_anomalies)

            anomalies_detected += detect_anomalies(db, file.filename, df)

            # Write import log entry so dashboard-stats can aggregate
            source_system, category, status = _classify_import(file.filename, df)
            if anomalies_detected > 0 and anomalies_detected / max(len(df), 1) > 0.1:
                status = "Manual Review Required"
            elif anomalies_detected > 0:
                status = "Low Confidence"

            log_entry = TbImportLog(
                filename=file.filename,
                source_system=source_system,
                category=category,
                row_count=len(df),
                status=status,
            )
            db.add(log_entry)

            # Persist lab rows for completeness queries
            if "lab" in (file.filename or "").lower() or "synth_lab" in (file.filename or "").lower():
                case_col_l = next((c for c in df.columns if c.lower() in ["caseid", "case_id"]), None)
                pat_col_l  = next((c for c in df.columns if c.lower() in ["pid", "patientid", "patient_id"]), None)
                for _, row in df.iterrows():
                    db.add(TbImportLabsData(
                        case_id=str(row.get(case_col_l, "")) if case_col_l else None,
                        patient_id=str(row.get(pat_col_l, "")) if pat_col_l else None,
                        test_name=str(row.get("test_name", row.get("parameter", ""))) if pd.notnull(row.get("test_name", row.get("parameter"))) else None,
                        result_value=str(row.get("result_value", row.get("value", ""))) if pd.notnull(row.get("result_value", row.get("value"))) else None,
                        ref_low=str(row.get("_ref_low", "")) if pd.notnull(row.get("_ref_low")) else None,
                        ref_high=str(row.get("_ref_high", "")) if pd.notnull(row.get("_ref_high")) else None,
                        row_data_complete=0 if row.isnull().any() else 1,
                    ))

            db.commit()
        finally:
            db.close()
            
    except Exception as e:
        app_logs.insert(0, {
            "timestamp": datetime.datetime.now().isoformat(),
            "event": "File Processing Error",
            "filename": file.filename,
            "status": f"Error: {str(e)}"
        })
        return {"error": str(e)}

    app_logs.insert(0, {
        "timestamp": datetime.datetime.now().isoformat(),
        "event": "File Uploaded & Processing",
        "filename": file.filename,
        "status": f"Success, {anomalies_detected} anomalies detected"
    })
    return {
        "message": f"Successfully received file {file.filename}", 
        "mapped_records": len(df), 
        "anomalies_detected": anomalies_detected
    }

@app.post("/cross-check")
async def cross_check(nursing_csv: UploadFile = File(...), motion_csv: UploadFile = File(...)):
    anomalies_detected = 0
    try:
        nursing_df = pd.read_csv(nursing_csv.file)
        motion_df = pd.read_csv(motion_csv.file)
        
        anomalies = evaluate_cross_check_datasets(nursing_df, motion_df)
        
        db = SessionLocal()
        try:
            commit_anomalies(db, anomalies)
            anomalies_detected = len(anomalies)
        finally:
            db.close()
            
    except Exception as e:
        app_logs.insert(0, {
            "timestamp": datetime.datetime.now().isoformat(),
            "event": "Cross-Check Error",
            "filename": f"{nursing_csv.filename} & {motion_csv.filename}",
            "status": f"Error: {str(e)}"
        })
        return {"error": str(e)}

    app_logs.insert(0, {
        "timestamp": datetime.datetime.now().isoformat(),
        "event": "Cross-Check Completed",
        "filename": "Multiple Files",
        "status": f"Success, {anomalies_detected} anomalies detected"
    })
    return {
        "message": "Cross-check successful", 
        "anomalies_detected": anomalies_detected
    }

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
