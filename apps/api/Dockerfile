FROM python:3.13.7-slim
WORKDIR /app
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
CMD ["uvicorn", "unifr_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
