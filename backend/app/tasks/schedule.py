from __future__ import annotations

from celery.schedules import crontab  # type: ignore[import-untyped]

beat_schedule = {
    "ais-snapshot-hourly": {
        "task": "collect_ais_snapshot",
        "schedule": crontab(minute=5),
    },
    "fred-indices-daily": {
        "task": "collect_fred",
        "schedule": crontab(hour=2, minute=0),
    },
    "fbx-scrape-daily": {
        "task": "scrape_fbx",
        "schedule": crontab(hour=3, minute=0),
    },
    "wci-scrape-weekly": {
        "task": "scrape_wci",
        "schedule": crontab(day_of_week=4, hour=4, minute=0),
    },
    "bunker-scrape-daily": {
        "task": "scrape_bunker",
        "schedule": crontab(hour=5, minute=0),
    },
    "openmeteo-6-hourly": {
        "task": "collect_openmeteo",
        "schedule": crontab(hour="*/6", minute=10),
    },
    "compute-port-congestion-hourly": {
        "task": "compute_port_congestion",
        "schedule": crontab(minute=15),
    },
    "compute-chokepoint-status-hourly": {
        "task": "compute_chokepoint_status",
        "schedule": crontab(minute=20),
    },
    "detect-anomalies-hourly": {
        "task": "detect_anomalies",
        "schedule": crontab(minute=30),
    },
    "generate-forecast-daily": {
        "task": "generate_forecast",
        "schedule": crontab(hour=7, minute=0),
    },
    "generate-insights-hourly": {
        "task": "generate_insights",
        "schedule": crontab(minute=45),
    },
    "enrich-top-insights-hourly": {
        "task": "enrich_top_insights",
        "schedule": crontab(minute=50),
    },
}
