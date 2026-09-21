FROM python:3.13.7-slim@sha256:5f55cdf0c5d9dc1a415637a5ccc4a9e18663ad203673173b8cda8f8dcacef689
ARG RELEASE_ID=development
LABEL org.opencontainers.image.revision=$RELEASE_ID
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir uv==0.11.23
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY apps/api apps/api
COPY packages packages
COPY data data
COPY alembic.ini ./
ENV PATH="/app/.venv/bin:$PATH" PYTHONPATH="/app/apps/api:/app/packages/domain/src:/app/packages/ingest/src" PYTHONUNBUFFERED=1
RUN useradd --create-home --uid 10001 planner
USER planner
EXPOSE 8000
CMD ["uvicorn", "unifr_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log", "--no-proxy-headers"]
