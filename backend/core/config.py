"""
core/config.py
──────────────
Single source of truth for all configuration values.
Reads from .env via pydantic-settings.
"""
from __future__ import annotations

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── LLM ────────────────────────────────────────────────────────────────
    gemini_api_key: str = ""
    # Default: prefer gemini-2.5-flash; auto-fallback to gemini-3.5-flash at runtime
    gemini_model: str = "gemini-2.5-flash"

    # ── Supabase ────────────────────────────────────────────────────────────
    supabase_url: str = ""
    # Accept both SUPABASE_SERVICE_ROLE_KEY and SUPABASE_KEY for flexibility
    supabase_service_role_key: str = ""
    supabase_key: str = ""          # alias / fallback
    supabase_publishable_key: str = ""  # anon key (read-only fallback)

    @property
    def supabase_effective_key(self) -> str:
        return (
            self.supabase_service_role_key
            or self.supabase_key
            or self.supabase_publishable_key
        )

    # ── Usage limits ────────────────────────────────────────────────────────
    free_tier_monthly_limit: int = 5
    # Used when testing without Supabase Auth — set in .env for dev
    dev_user_id: str = ""

    # ── KiCad ──────────────────────────────────────────────────────────────
    kicad_cli_path: str = "kicad-cli"
    kicad_scripting_path: str = ""

    # ── Paths ───────────────────────────────────────────────────────────────
    work_dir: str = "tmp"
    component_lib_path: str = "./component_library/components.json"

    # ── CORS ────────────────────────────────────────────────────────────────
    cors_origins: str = "http://localhost:5173,http://localhost:3000"


@lru_cache
def get_settings() -> Settings:
    return Settings()


# Module-level singleton for convenience
settings = get_settings()
