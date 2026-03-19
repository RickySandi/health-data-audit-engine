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

---

## 🐳 One-Click Deployment (Docker)

The entire stack—frontend, backend, and database—is containerised and orchestrated via Docker Compose, enabling a reproducible, environment-agnostic deployment in a single command.

### Prerequisites

- **Docker Desktop** (v4.x or later) running on the host machine.
- The following ports must be available and unoccupied:

| Port | Service |
| :--- | :--- |
| `80` | Angular Frontend (Nginx) |
| `8000` | FastAPI Backend |
| `5444` | PostgreSQL + pgvector |

### Launch

From the repository root, execute:

```bash
docker compose up --build -d
```

Docker Compose will build the frontend and backend images, pull the `pgvector/pgvector:pg16` database image, apply the health-check dependency chain, and start all three services in detached mode.

### Critical Initialisation — pgvector Extension

The `vector` extension must be activated within the database before the backend can persist embeddings or create its schema. Run the following **once** after the first launch:

```bash
docker compose exec db psql -U postgres -d health_data -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

> **Note:** Subsequent `docker compose up` invocations on an existing volume do not require this step—the extension persists with the data.

### Service Access URLs

| Service | URL |
| :--- | :--- |
| **Frontend Dashboard** | http://localhost |
| **Backend API (Swagger UI)** | http://localhost:8000/docs |
| **Database (direct connection)** | `localhost:5444` |

---

## 🛠️ Tech Stack & Architecture

The engine is deliberately assembled from best-in-class, production-grade components across every layer of the stack.

| Layer | Technology | Justification |
| :--- | :--- | :--- |
| **Frontend** | Angular 20, TailwindCSS, ngx-charts | Scalable, reactive component architecture with utility-first styling and declarative SVG visualisations. |
| **Backend** | FastAPI (Python 3.11), SQLAlchemy | High-performance, async-first API framework with automatic OpenAPI documentation and a robust ORM for schema management. |
| **Database** | PostgreSQL 16 + pgvector | Battle-tested relational integrity extended with high-dimensional vector storage, enabling clinical similarity searches and future embedding-based retrieval. |
| **Reporting** | html2canvas, jsPDF | Fully client-side, dependency-light audit report generation—no server round-trip, no data leaving the browser. |
