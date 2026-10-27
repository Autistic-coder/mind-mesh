# PostgreSQL setup and migration

MindMesh uses standard PostgreSQL through SQLAlchemy and psycopg. There is no provider SDK,
provider authentication service, or browser database connection. Neon Free suits a small demo;
another PostgreSQL host works with the same schema. FastAPI manages login and ownership.

## Fresh database

1. Create a **Free** Neon project near the API region. In **Connect**, disable connection pooling
   and copy the direct PostgreSQL URI. The app uses session schema settings; do not use a
   transaction pooler. Keep `sslmode=require` and any provider TLS options.
2. Copy `backend/.env.example` to the ignored `.env` and set `MINDMESH_DATABASE_URL`. Never put
   credentials in Git, frontend variables, screenshots, or chat.
3. Run `python -m alembic upgrade head` in the project virtual environment.
4. Start both services using the README commands.

Migrations create the private `mindmesh` schema and revoke `PUBLIC` access. Runtime access should
use a dedicated role with schema USAGE and table SELECT/INSERT/UPDATE/DELETE. Migrations may use
`MINDMESH_MIGRATION_DATABASE_URL`. Set `MINDMESH_APP_DATABASE_ROLE` before migrating to grant the
required privileges to an existing separate runtime role.

## Move existing work safely

Stop both services. Back up the source database and `var/uploads` / `var/models`. Leave the current
`MINDMESH_DATABASE_URL` unchanged and add the new direct URI as `MINDMESH_NEXT_DATABASE_URL` in
`.env`. Use an empty destination; the utility refuses to overwrite or merge private records.

PowerShell, repository root:

```powershell
$env:MINDMESH_MIGRATION_DATABASE_URL = (& .\.venv\Scripts\python.exe -c "from dotenv import dotenv_values; print(dotenv_values('.env')['MINDMESH_NEXT_DATABASE_URL'])")
.\.venv\Scripts\python.exe -m alembic upgrade head
Remove-Item Env:MINDMESH_MIGRATION_DATABASE_URL
.\.venv\Scripts\python.exe -m backend.migrate_database --dry-run
.\.venv\Scripts\python.exe -m backend.migrate_database
```

The assignment captures the URI without printing it. Do not echo the variable or enable command
tracing. The source is only read. Accounts, password hashes, projects, datasets, training history,
models, predictions, and chats retain their IDs. Complete dataset and model files are embedded in
their owning database rows. Older records require their original local files; missing or invalid
files stop the copy. The utility compares every field and file hash and checks committed row counts
with a new connection. The dry run rolls back all inserts.

Active sessions and transient rate limits are excluded. After verification, change
`MINDMESH_DATABASE_URL` to the destination, remove the temporary next URI, and restart. Sign in
again. Check original downloads and saved-model predictions, and verify a second account cannot
access those exact IDs. Keep the source backup until those checks pass. The utility never deletes
or closes the old hosted project. A failed import rolls back destination records; diagnose and
repeat against an empty destination before changing the runtime URI.

The older `backend.migrate_sqlite --source var/mindmesh.db` utility remains available for SQLite
records. It does not embed legacy files; keep original directories and use the database-copy
procedure into a fresh target to embed them before relying on ephemeral hosting.

## Storage and backups

Complete new uploads persist in `datasets.content_bytes`; fitted models persist in
`model_metadata.artifact_bytes`. Both load lazily, so list views do not pull large binary columns.
File access follows the owning record's server-side authorization. Deletion removes bytes in the
same database transaction. `var/uploads` and `var/models` are private disposable caches for new
records; missing cache files are restored from PostgreSQL. Never import untrusted model binaries.

Legacy records with no binary contents still need their original local files until copied. Back
those files up too. New-record backups must include the database binary columns. Before downgrading
the byte-storage migration, export dataset originals and models. Uploads are limited to 25 MB and
saved models to 50 MB each; account capacity is bounded by shared database quotas.

Neon Free has finite compute, storage, and transfer and scales to zero when idle. Review current
[plan limits](https://neon.com/docs/introduction/plans) in your dashboard. A provider change does
not guarantee lower latency. Region, cold starts, queries, and ML workload all matter.
