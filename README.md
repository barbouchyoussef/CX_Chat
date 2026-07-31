
<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-f5c542?style=for-the-badge&logo=opensourceinitiative&logoColor=white" alt="MIT License"/></a>&nbsp;
  <a href="backend/requirements.txt"><img src="https://img.shields.io/badge/Python-3.12+-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python 3.12+"/></a>&nbsp;
  <a href="https://fastapi.tiangolo.com/"><img src="https://img.shields.io/badge/Framework-FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI"/></a>&nbsp;
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/Frontend-React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 19"/></a>&nbsp;
  <a href="https://vite.dev/"><img src="https://img.shields.io/badge/Build-Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite"/></a>
</p>

---

# EY CX Studio — Customer Experience Intelligence Suite

EY CX Studio is a bilingual (English/French) platform that helps consultants run a full customer-experience engagement end to end. What began as the **ORION** maturity-assessment chat has grown into a suite of independent-but-connected modules — assessment, interview guides, desk research, and social listening — that can be used on their own or tied together into a tracked **project** pipeline for a given client.

Every module ships with an AI assistant, and the assistants share one reusable retrieval/answering engine (agentic RAG with local multilingual embeddings), so each chatbot is scoped to its own data with source citations.

---

## Modules

| Module | What it does |
|--------|--------------|
| **Maturity Assessment (ORION)** | A guided conversational diagnostic that scores CX maturity across the Manage / Analyze / Improve axes against structured rubrics, benchmarks competitors from live web evidence, and produces a final report with quick-wins and a recommendation timeline. |
| **Interview Guide** | Generates a tailored stakeholder interview guide (from a past assessment or from scratch), with live editing, answer capture, and an assistant that **interprets answers, flags gaps, and cross-references the ORION self-assessment for inconsistencies**. |
| **Desk Research** | Upload client documents (PDF, DOCX, PPTX, XLSX, images) and get a structured executive report. Robust extraction routes digital PDFs to a fast native text path and scans/Office files through docling (OCR + vision captioning), then synthesizes via map-reduce. A **RAG chatbot** answers questions over the documents *and* the generated report. |
| **Social Listening** | Scrapes public reviews and social content, classifies sentiment / themes / complaints, and builds an evidenced report (per-channel sentiment, momentum, verbatims). Its assistant answers from the report's **computed KPIs** (structured injection, not vector search). |
| **Projects** | Group a client engagement into a visual pipeline over the modules — see validated vs. remaining steps, jump into any module, and track progress. A tracking/navigation layer; the modules themselves stay independent. |

---

## Architecture

- **Backend** — FastAPI (async) + SQLAlchemy + PostgreSQL. Feature services live under `backend/app/services/` (`assessment`, `scraping`, `desk_research`, `projects`, and the shared `rag` engine). File-based stores keep per-session/report/project data out of the database.
- **Shared RAG engine** (`app/services/rag/`) — chunk → embed → store → retrieve → answer. Pluggable **context sources** per module: vector retrieval (desk research), KPI injection (social), live-guide injection (interview). Local multilingual embeddings (`multilingual-e5-small`) with a lexical fallback.
- **Frontend** — React 19 + TypeScript + Vite + Tailwind. A single reusable `<ModuleChat>` floating assistant is reused across modules; only the data source/endpoint changes.

---

## Tech Stack

- **Backend**: Python 3.12+, FastAPI, Uvicorn, SQLAlchemy, PostgreSQL, asyncpg
- **Document processing**: docling, EasyOCR, pypdfium2, python-pptx, openpyxl, Pillow
- **AI / retrieval**: Mistral, Moonshot (Kimi), Google Gemini, OpenRouter (vision), sentence-transformers (`multilingual-e5-small`), LangSearch (web search)
- **Scraping**: Apify, Bright Data
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Framer Motion, GSAP, Spline 3D, ExcelJS

---

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 18+
- PostgreSQL (locally or via the provided `docker-compose.yml`)

### 1. Database

Create the `cx_assessment` database, or start one via Docker:

```bash
docker compose up -d
```

### 2. Backend

```bash
cd backend
python -m venv .venv
# Windows (PowerShell):  .venv\Scripts\Activate.ps1
# macOS/Linux:           source .venv/bin/activate
pip install -r requirements.txt

# Configure environment
cp .env.example .env      # then fill in DATABASE_URL and the API keys you need

# Bootstrap schema + reference data
python seed.py

# Run the API
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

> The desk-research / chatbot embeddings use a local model (`multilingual-e5-small`) that downloads on first use (~470 MB). If `sentence-transformers` isn't installed, the chatbots fall back to lexical retrieval automatically.

### 3. Frontend

```bash
cd ../frontend
npm install
cp .env.example .env      # optional; defaults to the local API
npm run dev
```

Open [http://localhost:5173](http://localhost:5173), then head to **Services** to pick a module or start a project.

---

## Configuration

All backend configuration is via environment variables — see [`backend/.env.example`](backend/.env.example) for the full, commented list. Highlights:

- **Required**: `DATABASE_URL`
- **LLM providers** (at least one chat provider): `MISTRAL_API_KEY`, optionally `MOONSHOT_API_KEY`, `GEMINI_API_KEYS`, `OPENROUTER_API_KEY`
- **Scraping**: `APIFY_API_TOKEN`, `BRIGHTDATA_API_TOKEN`
- **Web search**: `LANGSEARCH_API_KEY`
- **Desk Research / RAG**: `DESK_OCR_LANGS`, `RAG_EMBED_BACKEND`, `RAG_EMBED_MODEL`

No secrets are committed to the repo. Generated runtime data (`scraped_data/`, `desk_research_data/`, `rag_data/`, `projects_data/`, `interview_chat_data/`) is git-ignored.

Frontend: `VITE_API_BASE_URL` (see `frontend/.env.example`).

---

## Tests

```bash
cd backend
.venv/Scripts/python.exe -m pytest        # Windows
# python -m pytest                         # macOS/Linux
```

Frontend type-check: `cd frontend && npx tsc --noEmit`.

---

## Documentation

Cost analysis, API projections, and presentation materials live in [`/docs`](docs) — e.g. [Executive Summary](docs/EXECUTIVE_SUMMARY.md), [Cost Analysis](docs/COST_ANALYSIS.md), [Implementation Guide](docs/IMPLEMENTATION_GUIDE.md), and [API Technical Breakdown](docs/API_TECHNICAL_BREAKDOWN.md).

---

## License

Licensed under the MIT License — see [LICENSE](LICENSE).
