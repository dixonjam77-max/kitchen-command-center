# Kitchen Command Center

Full-stack kitchen management app with web (Next.js) and mobile (React Native/Expo) frontends sharing a FastAPI backend. Manages food inventory, equipment, recipes, meal planning, and grocery lists with AI integration via the Anthropic Claude API.

## Quick Start

### 1. Start infrastructure
```bash
cp .env.example .env
# Edit .env with your values (especially JWT_SECRET and ANTHROPIC_API_KEY)
docker-compose up -d
```

### 2. Run backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate  # Windows
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```
API available at http://localhost:8000 — Swagger docs at http://localhost:8000/docs

### 3. Run web frontend
```bash
cd web
npm install
npm run dev
```
Web app available at http://localhost:3000

## Tech Stack
- **Backend:** Python FastAPI, PostgreSQL, SQLAlchemy, Alembic, Celery + Redis
- **Web:** Next.js 14, Tailwind CSS, Zustand, TanStack Query
- **Mobile:** React Native / Expo (Phase 5)
- **AI:** Anthropic Claude API
