import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import auth, pantry, tools, recipes, collections, meal_plans, grocery, ai, import_export

settings = get_settings()

app = FastAPI(
    title="Kitchen Command Center API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Build allowed origins list (supports comma-separated FRONTEND_URL for multiple domains)
_origins = ["http://localhost:3000"]
for origin in settings.FRONTEND_URL.split(","):
    origin = origin.strip()
    if origin and origin not in _origins:
        _origins.append(origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(pantry.router, prefix="/api/v1/pantry", tags=["Pantry"])
app.include_router(tools.router, prefix="/api/v1/tools", tags=["Tools"])
app.include_router(recipes.router, prefix="/api/v1/recipes", tags=["Recipes"])
app.include_router(collections.router, prefix="/api/v1/collections", tags=["Collections"])
app.include_router(meal_plans.router, prefix="/api/v1/meal-plans", tags=["Meal Plans"])
app.include_router(grocery.router, prefix="/api/v1/grocery", tags=["Grocery"])
app.include_router(ai.router, prefix="/api/v1/ai", tags=["AI"])
app.include_router(import_export.router, prefix="/api/v1/import", tags=["Import"])


@app.get("/health")
def health():
    return {"status": "ok"}


@app.on_event("startup")
def startup():
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
