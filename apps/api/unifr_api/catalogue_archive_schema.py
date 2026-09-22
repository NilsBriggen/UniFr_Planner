"""Historical heads and checkpoints registered without importer side effects."""

from sqlalchemy import JSON, Column, ForeignKey, Integer, String, Table, Text
from .database import metadata

archive_terms = Table(
    "catalogue_archive_term",
    metadata,
    Column("term", String, primary_key=True),
    Column("source_value", String, nullable=False),
    Column("status", String, nullable=False),
    Column("snapshot_id", ForeignKey("catalogue_snapshot.id")),
    Column("checked_at", String),
    Column("next_attempt_at", String),
    Column("failures", Integer, nullable=False),
    Column("error", Text),
    Column("progress", JSON, nullable=False),
)
checkpoints = Table(
    "catalogue_archive_checkpoint",
    metadata,
    Column("term", ForeignKey("catalogue_archive_term.term"), primary_key=True),
    Column("kind", String, primary_key=True),
    Column("ordinal", Integer, primary_key=True),
    Column("data", JSON, nullable=False),
)

archive_discovery = Table(
    "catalogue_archive_discovery",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("status", String, nullable=False),
    Column("checked_at", String, nullable=False),
)
