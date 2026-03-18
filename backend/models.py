from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.orm import declarative_base, relationship
from pgvector.sqlalchemy import Vector
import datetime

Base = declarative_base()

class Patient(Base):
    __tablename__ = "patients"
    
    id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String, index=True)
    last_name = Column(String, index=True)
    date_of_birth = Column(DateTime)
    medical_history_notes = Column(Text)
    clinical_similarity_vector = Column(Vector(1536))
    
    cases = relationship("Case", back_populates="patient")


class Case(Base):
    __tablename__ = "cases"
    
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"))
    admission_date = Column(DateTime, default=datetime.datetime.utcnow)
    description = Column(Text)
    
    patient = relationship("Patient", back_populates="cases")
    assessments = relationship("CareAssessment", back_populates="case")
    lab_results = relationship("LabResult", back_populates="case")


class CareAssessment(Base):
    """
    Based on epaAC (European Patients Academy on Therapeutic Innovation / Care Assessments etc)
    """
    __tablename__ = "care_assessments"
    
    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id"))
    assessment_date = Column(DateTime, default=datetime.datetime.utcnow)
    notes = Column(Text)
    epa_ac_score = Column(Integer)
    embedding = Column(Vector(1536))
    
    case = relationship("Case", back_populates="assessments")


class LabResult(Base):
    __tablename__ = "lab_results"
    
    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id"))
    test_name = Column(String, index=True)
    result_value = Column(String)
    reference_range = Column(String)
    test_date = Column(DateTime, default=datetime.datetime.utcnow)
    
    case = relationship("Case", back_populates="lab_results")


class TbImportAcData(Base):
    __tablename__ = "tbImportAcData"
    
    id = Column(Integer, primary_key=True, index=True)
    FallID = Column(String, index=True)
    PID = Column(String, index=True)
    Einschaetzung = Column(DateTime)
    IID = Column(String, index=True)
    Kuerzel = Column(String)
    SID_value = Column(String) 
    
    # Metadata fields for Dashboard
    Provenance_Station = Column(String)
    Provenance_Account = Column(String)
    Quality_Is_Null = Column(Integer, default=0) # Or Boolean
    Anomaly_Flag = Column(Integer, default=0) # Or Boolean

class TbImportNursingDailyReports(Base):
    __tablename__ = "tbImportNursingDailyReports"
    
    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(String, index=True)
    case_id = Column(String, index=True)
    report_date = Column(DateTime)
    nursing_note_free_text = Column(Text)
    
    # NLP Extracted Metadata
    extracted_symptoms = Column(String) # JSON list
    extracted_interventions = Column(String) # JSON list
    patient_state = Column(String)
    
    # Flags
    urgency_flag = Column(Integer, default=0)
    anomaly_alert = Column(Integer, default=0)

class DeviceMotionData(Base):
    """ Used to cross-reference sensor data for falls against NLP notes """
    __tablename__ = "device_motion_data"
    
    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(String, index=True)
    event_type = Column(String) # e.g. 'fall', 'walking'
    event_time = Column(DateTime)
