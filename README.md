# Smart Health Data Mapping - Automated Audit MVP
*Building a 'Digital Twin' of Patient Care*

## 🚀 Project Essence
The healthcare sector produces massive amounts of fragmented data trapped in silos—Hospital Information Systems (HIS), EPS records, handwritten nursing notes, and raw sensor telemetry. This application acts as a central **AI Mapping Engine**, unifying these heterogeneous datasets into a single, standardized SQL schema. By bridging structural, clinical, and temporal gaps, we create a 'Digital Twin' of care that enables holistic auditing, real-time safety cross-checks, and actionable insights.

## 🔄 The Functional Flow

### Step 1: Ingestion
A drag-and-drop interface capable of handling heterogeneous files—including CSV, Excel, and free-text PDF exports—simultaneously routing them to backend pipelines.

### Step 2: Processing
The core pipeline normalizes data through structural mapping, duplicate removal (implementing last-record logic based on timestamps), and value neutralization (transforming corrupted strings like `'unknow'` or `'Missing'` directly to `NULL` for clean database ingestion).

### Step 3: Intelligence
The engine moves beyond structural mapping to clinical reasoning:
- **NLP Extraction**: Deconstructs free-text nursing daily reports to extract clinical entities.
- **Rules Engine**: Parses parsed lab records (`_ref_low`, `_ref_high`) catching out-of-bounds metrics and flagging critical severity events.

### Step 4: Innovation (The 'Hidden Fall' Service)
A cross-check synchronization service between human input and machine telemetry. The engine dynamically joins daily nursing reports with device motion data. If NLP detects a hazard keyword (`sturz`, `fall`, `floor`) but the sensor's `fall_event_0_1` registers as `0` (no fall), a **High Severity 'Sensor Conflict' alert** is triggered.

### Step 5: Visualization
An interactive Angular dashboard translating the unified schema into:
- Real-time KPIs (Data Quality Index, Medication Adherence, Anomalies).
- Source System Distribution Charts.
- An **Anomaly Explorer** with a 'Double-Check' interface to Validate/Dismiss flagged metrics.
- One-click **PDF Report Export** powered by html2canvas & jsPDF for institutional compliance auditing.

---

## 🧪 The Testing Suite

This repository includes a suite of synthetic data files designed to test distinct logic flows.

| File Name | Primary Feature Tested | Expected Outcome |
| :--- | :--- | :--- |
| `epaAC-Data-1.csv` | **Duplicate Handling & Basic Mapping** | Successfully maps to SQL while rejecting identical row subsets based on Last-Record logic and neutralizing 'Missing' strings to NULL. |
| `synth_labs_1000_cases.csv` | **Clinical Anomaly Detection** | Correctly parses reference ranges. Triggers High-Severity alerts for values lying outside absolute boundaries (e.g. Potassium levels). |
| `synthetic_nursing_daily_reports.csv` | **NLP Entity Extraction** | Reads unstructured text fields to categorize report topics and extract critical incident keywords. |
| `synthetic_device_motion_fall_data.csv` | **The Cross-Check Service** | When uploaded *with* the nursing reports, tests the relational sync. Logs 'Sensor Conflict' alerts if the text and sensors disagree on a hazard. |
| `synthetic_medication_raw_inpatient.csv` | **Complex ORDER/ADMIN Timeline Logic** | Evaluates Adherence. Flags `ORDER` rows lacking an `ADMIN` given state. Scales severity to High if a missing dose is a critical medication like an anticoagulant. |

---

## 💶 Business Value & Use Cases

In the DACH region alone, annual healthcare expenditure exceeds **€100 Billion**. A massive fraction of this is lost to administrative overhead, duplicated documentation, and retrospective error correction.

By deploying this engine:
- A **1-2% efficiency gain** in data mapping, billing accuracy, and proactive error reduction translates to **€800M – €1.6B saved annually**.
- **Use Case:** Reducing manual lab reviews by 40% and preventing adverse events (missed critical diagnostics or unlogged falls) yielding massive operational and legal risk mitigation for hospital trusts.

## 🔭 Future Roadmap
- **Scaling Architecture**: Deploy the engine across cloud architectures to organically support **1,400+ institutions** simultaneously.
- **Live HL7/FHIR Integration**: Transition from static CSV upload boundaries to real-time ingestion streams parsing HL7/FHIR payloads standardizing cross-hospital communication layers.
