"""Immutable catalogue read projections and backfill of existing generations."""

from alembic import op
from sqlalchemy import select, update

from unifr_api.catalogue import offerings, snapshots
from unifr_api.catalogue_projection import facets, generations, projection, stage_projection
from unifr_ingest.models import CatalogueSnapshot, SyncReport

revision = "0006_catalogue_read"
down_revision = "0005_sharing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    for table in (generations, projection, facets):
        table.create(connection)
    # One generation at a time: never combine immutable publication identities.
    for row in connection.execute(select(snapshots.c.id, snapshots.c.data, snapshots.c.report)):
        data = dict(row.data)
        data["offerings"] = list(
            connection.execute(
                select(offerings.c.data).where(offerings.c.snapshot_id == row.id)
            ).scalars()
        )
        report = SyncReport.model_validate(row.report)
        stage_projection(connection, CatalogueSnapshot.model_validate(data), report)
        connection.execute(
            update(generations)
            .where(generations.c.snapshot_id == row.id)
            .values(outcome=report.outcome)
        )


def downgrade() -> None:
    for table in (facets, projection, generations):
        table.drop(op.get_bind())
