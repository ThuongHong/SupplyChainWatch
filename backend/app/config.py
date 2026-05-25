from __future__ import annotations

from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings loaded from environment variables."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "local"
    log_level: str = "INFO"
    database_url: str = (
        "postgresql+psycopg://globalsupplywatch:globalsupplywatch@postgres:5432/globalsupplywatch"
    )
    async_database_url: str | None = None
    redis_url: str = "redis://redis:6379/0"
    celery_broker_url: str = "redis://redis:6379/1"
    celery_result_backend: str = "redis://redis:6379/2"

    aisstream_api_key: str | None = None
    fred_api_key: str | None = None
    un_comtrade_api_key: str | None = None
    world_bank_api_key: str | None = None
    portwatch_ports_url: str = (
        "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/ArcGIS/rest/services/"
        "Daily_Ports_Data/FeatureServer/0/query"
    )
    portwatch_chokepoints_url: str = (
        "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/ArcGIS/rest/services/"
        "Daily_Chokepoints_Data/FeatureServer/0/query"
    )
    scraper_user_agent: str = Field(
        default="GlobalSupplyWatch/0.1 academic project contact@example.com"
    )
    dashscope_api_key: SecretStr | None = None
    gemini_api_key: SecretStr | None = None
    gemini_model: str = "gemini-2.5-flash"
    gemini_base_url: str = "https://generativelanguage.googleapis.com"
    dashscope_base_url: str = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
    llm_model_fast: str = "qwen3.5-flash"
    llm_model_fast_fallbacks: str = "qwen3.5-flash-2026-02-23"
    llm_model_reasoning: str = "deepseek-v4-flash"
    llm_model_reasoning_fallbacks: str = "qwen3.5-flash,qwen3.5-flash-2026-02-23"
    llm_enabled: bool = True
    rate_limit_enabled: bool = False
    llm_timeout_fast: int = 30
    llm_timeout_reasoning: int = 60
    enrichment_provider_enabled: bool = False
    backend_demo_fallback_enabled: bool = False
    portwatch_history_days: int = 180
    risk_story_min_history_days: int = 90
    risk_forecast_min_history_days: int = 14
    risk_story_z_threshold: float = 2.0
    risk_story_percent_change_threshold: float = 35.0
    risk_forecast_horizon_days: int = 14
    risk_forecast_max_gap_rate: float = 0.35


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached application settings."""
    return Settings()


def get_async_database_url() -> str:
    """Return the async SQLAlchemy database URL."""
    settings = get_settings()
    return settings.async_database_url or settings.database_url
