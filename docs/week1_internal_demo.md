# Week 1 Internal Demo Script

1. Start services with `make up`.
2. Run migrations with `make migrate`.
3. Seed reference data with `make seed`.
4. Open Flower at http://localhost:5555 and confirm worker connectivity.
5. Trigger one collector task manually, for example:

   ```bash
   docker compose exec backend celery -A app.tasks.celery_app call collect_fred
   ```

6. Query `collection_log` to verify the audit row.
7. Show `docs/data_sources.md` credential checklist and source fallback plan.

## Known Week 1 Gaps

- Real 7-day data accumulation requires live API keys and services running continuously.
- AIS historical backfill requires downloading a NOAA / MarineCadastre sample chosen by the team.
- Great Expectations is listed as an optional dependency; the current repo includes lightweight quality checks until the team decides whether to commit the heavier GE project structure.
