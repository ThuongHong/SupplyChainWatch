.PHONY: up down logs shell-be shell-fe migrate seed test test-llm collect-all forecast

up:
	docker compose up -d
	$(MAKE) migrate
	$(MAKE) seed
	$(MAKE) collect-all

down:
	docker compose down

logs:
	docker compose logs -f

shell-be:
	docker compose exec backend bash

shell-fe:
	docker compose exec frontend sh

migrate:
	docker compose exec backend alembic upgrade head

seed:
	docker compose exec backend python -m app.scripts.seed_reference_data

test:
	docker compose exec backend pytest

test-llm:
	docker compose exec backend pytest -m llm --override-ini addopts=

collect-all:
	docker compose exec backend celery -A app.tasks.celery_app call collect_all

forecast:
	docker compose exec backend celery -A app.tasks.celery_app call generate_forecast
