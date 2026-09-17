# Ingestion

Pure models, HTML/calendar parsers, validation and sync orchestration live in
`src/unifr_ingest`. The HTTP adapter is a separate module (`http.py`); PostgreSQL
persistence and the server-side CLI live in `apps/api/unifr_api/catalogue*.py`.

See [catalogue operations](../../docs/catalogue-operations.md) for import,
daily scheduling, validation rules and the typed search boundary. Public fixture
provenance and deliberately synthetic edge cases are documented in
[`tests/fixtures/PROVENANCE.md`](tests/fixtures/PROVENANCE.md).
