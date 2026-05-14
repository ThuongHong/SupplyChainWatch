# Week 1 Checklist

## Completed in Repository

- [x] Monorepo scaffold: `backend/`, `frontend/`, `docs/`, `docker/`, notebooks.
- [x] Docker Compose skeleton: PostgreSQL TimescaleDB/PostGIS, Redis, backend, worker, beat, Flower, Mailhog.
- [x] `.env.example`.
- [x] README skeleton.
- [x] Pre-commit config.
- [x] GitHub Actions lint/test workflow.
- [x] Pull request template.
- [x] Alembic setup.
- [x] Initial migration for vessel, freight, bunker, congestion, trade, anomaly, forecast, insight, reference, and collection-log tables.
- [x] Seed script for major ports and chokepoints.
- [x] Base collector with retry, backoff, Pydantic validation, and collection audit logging.
- [x] AISStream, FRED, UN Comtrade, Open-Meteo, Ship & Bunker, FBX, and WCI collector modules.
- [x] Celery app, beat schedule, and task wrappers.
- [x] Parser/unit tests with mocked HTTP behavior.
- [x] Initial data-source documentation and notebook placeholders.
- [x] Lightweight data-quality helpers.

## Requires Team / External Accounts

- [ ] Team meeting and role assignment.
- [ ] Create GitHub repository, branch protection, and project board.
- [ ] Register AISStream, FRED, UN Comtrade, and World Bank API keys.
- [ ] Run collectors continuously for 7+ days to satisfy the real-data milestone.
- [ ] Choose and download NOAA / MarineCadastre AIS backfill sample.
- [ ] Decide whether to commit a full Great Expectations project structure or keep lightweight checks for the course scope.
