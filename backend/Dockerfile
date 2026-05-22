FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential ca-certificates curl \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY . /app
RUN pip install --no-cache-dir -e .[dev]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
