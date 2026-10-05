# Supabase PostgreSQL setup and SQLite cutover

MindMesh uses Supabase only as hosted PostgreSQL. FastAPI continues to manage accounts, Argon2id
password hashes, opaque cookie sessions, CSRF checks, and ownership. The React application does not
receive Supabase credentials or query the database directly.

## 1. Choose a connection

Create a Supabase project and open **Dashboard → Connect**. Copy an exact URI supplied there:

- Use a direct connection when the server supports IPv6 or the project has the required IPv4
  support.
- Otherwise use the Session pooler URI on port 5432.
- Do not use transaction mode for Alembic migrations.

Supabase documents these choices in [Connect to your database](https://supabase.com/docs/guides/database/connecting-to-postgres)
and [connection management](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits).
Keep `sslmode=require` in hosted connection strings. For stricter certificate verification, follow
Supabase's [SSL enforcement guide](https://supabase.com/docs/guides/platform/ssl-enforcement) and use
its downloaded CA certificate.

Copy `backend/.env.example` to the repository root as `.env` and replace every placeholder. Never
commit this file.

```dotenv
MINDMESH_DATABASE_URL=postgresql+psycopg://RUNTIME_USER:PASSWORD@EXACT_HOST_FROM_CONNECT:5432/postgres?sslmode=require
MINDMESH_MIGRATION_DATABASE_URL=postgresql+psycopg://MIGRATION_USER:PASSWORD@EXACT_HOST_FROM_CONNECT:5432/postgres?sslmode=require
MINDMESH_APP_DATABASE_ROLE=mindmesh_app
MINDMESH_UPLOAD_DIR=./var/uploads
MINDMESH_MODEL_DIR=./var/models
MINDMESH_ORIGIN=http://127.0.0.1:5173
```

`MINDMESH_MIGRATION_DATABASE_URL` may use the project owner for schema changes. For least privilege,
create a separate login role in the Supabase SQL editor, put that role's URI in
`MINDMESH_DATABASE_URL`, and set its name in `MINDMESH_APP_DATABASE_ROLE`. The migration verifies
that the role already exists and grants only schema usage plus table and sequence data access. If
one owner connection is used for local development, omit `MINDMESH_APP_DATABASE_ROLE` and the
separate migration URL.

The API loads `.env` from the repository root with `python-dotenv`. It refuses to start without an
explicit database URL and does not fall back to SQLite.

## 2. Create and protect the schema

With both application services stopped, run:

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
```

Alembic creates a dedicated `mindmesh` schema, all application tables, indexes, uniqueness rules,
foreign keys, and delete behavior. It revokes schema and table access from PostgreSQL `PUBLIC` and
Supabase's `anon` and `authenticated` Data API roles. Supabase recommends a private schema for data
that should never be exposed through its Data API; see [Securing your API](https://supabase.com/docs/guides/api/securing-your-api)
and [Database hardening](https://supabase.com/docs/guides/database/secure-data).

This application does not use Supabase Auth IDs, so policies based on `auth.uid()` would not match
MindMesh account IDs. FastAPI derives ownership from the signed server session and includes it in
every private resource query.

## 3. Preflight the existing SQLite data

Keep the original database and private file directories together. The default source is usually
`var/mindmesh.db`. First back up the database and files while the old API is stopped:

```powershell
Copy-Item var\mindmesh.db var\mindmesh.before-supabase.db
Copy-Item var\uploads var\uploads.before-supabase -Recurse
Copy-Item var\models var\models.before-supabase -Recurse
```

Run a dry run. It reads the entire SQLite source, checks the migrated PostgreSQL schema, detects
primary-key and unique-value conflicts, exercises foreign keys, and rolls back all target writes:

```powershell
.\.venv\Scripts\python.exe -m backend.migrate_sqlite --source var\mindmesh.db --dry-run
```

Resolve any reported conflict before continuing. The tool never writes to or deletes the SQLite
source.

## 4. Perform the cutover

Keep both the frontend and API stopped so no record or file changes during transfer. Then run:

```powershell
.\.venv\Scripts\python.exe -m backend.migrate_sqlite --source var\mindmesh.db
```

The import runs in one PostgreSQL transaction and copies users, Argon2id password hashes, projects,
dataset metadata, training configurations and runs, model metadata, predictions, conversations, and
messages in dependency order. Existing matching rows are skipped, so a rerun does not duplicate
them. A differing row or unique-value collision stops and rolls back the transaction.

Sessions are deliberately not copied. Existing users sign in again, which creates a new opaque
session token whose hash is stored in PostgreSQL.

The utility prints verified source record counts. PostgreSQL foreign keys verify imported
relationships. Keep `var/uploads` and `var/models` at the configured paths: their bytes are not sent
to Supabase, while the imported database records retain their server-generated filenames.

Start the API and frontend, then verify:

1. An existing user can sign in.
2. Its projects and datasets appear.
3. A stored dataset downloads and previews.
4. A saved run opens and a saved model makes a prediction.
5. A second account cannot access the first account's exact resource IDs.

## 5. Roll back

Stop both services. Keep the PostgreSQL project unchanged for diagnosis. To return temporarily to
the backed-up SQLite application version, check out the pre-cutover application commit, restore the
database and both private directories from the backups, and use that version's SQLite configuration.
Do not point the current PostgreSQL-only runtime at SQLite.

After correcting a failed import, the current utility can be rerun safely because matching records
are skipped and conflicting records are never overwritten.
