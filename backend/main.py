from fastapi import FastAPI, UploadFile, File
import uvicorn

app = FastAPI(title="Healthcare Data Mapping MVP")

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.post("/map-data")
async def map_data(file: UploadFile = File(...)):
    # Placeholder for mapping logic (CSV, PDF, Free-text) using Pandas and Langchain
    return {"message": f"Successfully received file {file.filename}", "mapped_records": 0}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
