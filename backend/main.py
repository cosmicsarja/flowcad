"""
main.py — FlowCAD Pipeline API
FastAPI application entry point.
"""
from __future__ import annotations

import logging
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# ── Load .env ────────────────────────────────────────────────────────────────
_env_file = Path(__file__).parent / ".env"
if _env_file.exists():
    load_dotenv(_env_file, override=True)
else:
    load_dotenv()  # look for .env in cwd

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

# ── Config (now via pydantic-settings) ──────────────────────────────────────
from core.config import settings

# ── Ensure work directory exists ─────────────────────────────────────────────
work_dir = Path(settings.work_dir)
work_dir.mkdir(parents=True, exist_ok=True)
logger.info("Work directory: %s", work_dir.resolve())

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="FlowCAD Pipeline API",
    description=(
        "AI-powered Prompt-to-PCB backend pipeline. "
        "Takes a natural-language circuit description and produces "
        "a verified PCB design: schematic, netlist, Gerbers, BOM, and 3D model."
    ),
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ─────────────────────────────────────────────────────────────────────
# Explicit origins from config (e.g. production domain)
_explicit_origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]

# Regex that covers:
#   • Any localhost or 127.0.0.1 port (Vite default 5173, CRA 3000, etc.)
#   • *.lovable.app  (Lovable preview deployments)
#   • *.lovable.dev  (Lovable dev URLs)
#   • *.vercel.app   (Vercel preview deployments)
#   • *.onrender.com (Render.com deployments)
_ORIGIN_REGEX = (
    r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"
    r"|^https://([a-zA-Z0-9\-]+\.)?lovable\.app$"
    r"|^https://([a-zA-Z0-9\-]+\.)?lovable\.dev$"
    r"|^https://([a-zA-Z0-9\-]+\.)?vercel\.app$"
    r"|^https://([a-zA-Z0-9\-]+\.)?onrender\.com$"
)

allow_all = "*" in _explicit_origins
if allow_all:
    _explicit_origins.remove("*")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if allow_all else _explicit_origins,
    allow_origin_regex=None if allow_all else _ORIGIN_REGEX,
    allow_credentials=not allow_all,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
from routers.health import router as health_router
# Per-stage routers
from routers.requirements import router as req_router
from routers.architecture import router as arch_router
from routers.components import router as comp_router
from routers.schematic import router as schematic_router
from routers.pcb import router as pcb_router
from routers.placement import router as placement_router
from routers.verification import router as verify_router
from routers.export import router as export_router
from routers.edit import router as edit_router
# Orchestration + project CRUD
from routers.projects import router as projects_router
# Backward-compat: full pipeline chained endpoint
from routers.pipeline import router as pipeline_router

app.include_router(health_router)
# Per-stage (Stage 1–9)
app.include_router(req_router)
app.include_router(arch_router)
app.include_router(comp_router)
app.include_router(schematic_router)
app.include_router(pcb_router)
app.include_router(placement_router)
app.include_router(verify_router)
app.include_router(export_router)
app.include_router(edit_router)
# Orchestration
app.include_router(projects_router)
# Legacy chain endpoint
app.include_router(pipeline_router)


@app.on_event("startup")
async def startup_event():
    logger.info("FlowCAD API v2 ready. Docs: http://localhost:8000/docs")
    logger.info("Routes registered: %d", len(app.routes))

    # LLM provider info
    if not settings.gemini_api_key:
        error_msg = "CRITICAL: GEMINI_API_KEY is not set. Please add it to Render environment variables or .env."
        logger.error(error_msg)
        raise RuntimeError(error_msg)
        
    from core.gemini_client import active_model_name
    logger.info("LLM provider: Google Gemini (%s)", active_model_name())

    # Supabase info
    if not settings.supabase_url or not settings.supabase_effective_key:
        error_msg = "CRITICAL: SUPABASE_URL and SUPABASE_KEY (or SUPABASE_SERVICE_ROLE_KEY) must be set. Please add them to Render environment variables or .env."
        logger.error(error_msg)
        raise RuntimeError(error_msg)
        
    logger.info("Supabase: %s", settings.supabase_url)

    # Free-tier limit
    logger.info("Free-tier monthly limit: %d generations", settings.free_tier_monthly_limit)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
