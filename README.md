
<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-f5c542?style=for-the-badge&logo=opensourceinitiative&logoColor=white" alt="MIT License"/></a>&nbsp;
  <a href="backend/requirements.txt"><img src="https://img.shields.io/badge/Python-3.12+-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python 3.12+"/></a>&nbsp;
  <a href="https://github.com/astral-sh/uv"><img src="https://img.shields.io/badge/Package_Manager-uv-7c3aed?style=for-the-badge&logo=rust&logoColor=white" alt="uv"/></a>&nbsp;
  <a href="https://fastapi.tiangolo.com/"><img src="https://img.shields.io/badge/Framework-FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI"/></a>&nbsp;
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/Frontend-React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 19"/></a>&nbsp;
  <a href="https://vite.dev/"><img src="https://img.shields.io/badge/Build-Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite"/></a>
</p>

---

# ORION CX Chat — Customer Experience Maturity Assessment

ORION CX Chat is a state-of-the-art, bilingual (English/French) conversational diagnostic application designed to evaluate a company's Customer Experience (CX) maturity. Using a guided interactive chat interface, it collects data on key CX axes, grades capabilities against structured rubrics, and generates comprehensive reports complete with competitor benchmarks and dynamic timelines.

---

## Key Features

*   **Interactive Conversational Flow**: Dynamically adjusts follow-up questions based on company size, region, and previous answers.
*   **3D Interactive Avatar**: Embedded Spline-based 3D ORION robot guiding the user through onboarding.
*   **Multi-Choice & Text Inputs**: Combines guided options with natural language answers.
*   **Competitor Benchmarking**: Automatically crawls official competitor sites, screens evidence for high credibility, and selects relevant leaders with user-friendly French/English summaries.
*   **Automated Insights & Timeline**: Generates actionable "Quick Wins" and timeline recommendations based on identified maturity gaps.

---

## Tech Stack

*   **Backend**: Python 3.12+, FastAPI, Uvicorn, SQLAlchemy, PostgreSQL, asyncpg
*   **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Framer Motion, GSAP, Spline 3D
*   **AI & Search API**: Mistral AI (medium-latest), LangSearch (web-search & rerank)

---

## Getting Started

### Prerequisites

*   Python 3.12+
*   Node.js 18+
*   PostgreSQL running locally or via Docker

---

### 1. Database Setup

Ensure PostgreSQL is running and create the database `cx_assessment`.
Alternatively, you can run PostgreSQL via Docker using the provided `docker-compose.yml` in the root:

```bash
docker compose up -d
```

---

### 2. Backend Installation & Startup

1. Navigate to the `backend/` directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv .venv
   # On Windows (PowerShell):
   .venv\Scripts\Activate.ps1
   # On macOS/Linux:
   source .venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Create a `.env` file based on `.env.example` and set your API keys:
   ```env
   DATABASE_URL=postgresql+asyncpg://postgres:password@127.0.0.1:5432/cx_assessment
   MISTRAL_API_KEY=your-key-here
   LANGSEARCH_API_KEY=your-key-here
   ```
5. Start the backend development server:
   ```bash
   python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
   ```

---

### 3. Frontend Installation & Startup

1. Navigate to the `frontend/` directory:
   ```bash
   cd ../frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Project Documentation

All cost analysis reports, API projections, and presentation materials have been compiled inside the `/docs` folder:

*   [Executive Summary](docs/EXECUTIVE_SUMMARY.md): Pricing comparisons, projections, and tier recommendations.
*   [Cost Analysis Guide](docs/COST_ANALYSIS.md): Annual token consumption estimates.
*   [Implementation Guide](docs/IMPLEMENTATION_GUIDE.md): Deep-dive into conversational architectures and DB logic.
*   [API Technical Breakdown](docs/API_TECHNICAL_BREAKDOWN.md): Rate limits and LLM call flows.
*   [Elevator Pitch Slides](docs/ELEVATOR_PITCH.md): Visual script for presenting pricing tiers to associates.

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
