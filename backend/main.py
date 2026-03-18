from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import datetime

app = FastAPI(title="Healthcare Data Mapping MVP")

# Allow CORS for local Angular development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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

@app.post("/map-data")
async def map_data(file: UploadFile = File(...)):
    app_logs.insert(0, {
        "timestamp": datetime.datetime.now().isoformat(),
        "event": "File Uploaded & Processing",
        "filename": file.filename,
        "status": "Success"
    })
    return {"message": f"Successfully received file {file.filename}", "mapped_records": 100}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
