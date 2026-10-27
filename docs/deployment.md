# Deploy one MindMesh instance

This path uses Docker Compose on an existing Linux VM and Caddy for HTTPS. It keeps React, FastAPI,
SQLAlchemy, Supabase PostgreSQL, the existing cookie login, and private filesystem storage. No cloud
resources are created by these files. The Docker image has not been built on the development machine
when Docker is unavailable; see the release verification record for checks actually performed.

## Supported size and worker model

Run exactly **one container, one Uvicorn worker, one training thread** against this workspace database.
Up to four queued/running training submissions are accepted globally. Do not enable multiple workers,
replicas, autoscaling, or development reload in production. The submission lock is process local;
the authentication and operation rate limits are atomic database records shared across connections.

Start with 2 CPU cores, 4 GB RAM, and disk space appropriate to uploads. These are planning values,
not a capacity guarantee. Training accepts up to 100,000 usable rows, 50 features, and 200 categories
per categorical feature. Uploads have separate validation limits. Heavy work runs off the async event
loop; a single large training run can still use substantial CPU and memory. Native numeric libraries
are limited to one thread in the image.

Jobs use the in-process executor, not a durable queue. On a clean database-connected startup, queued
or running records are marked interrupted and can be resubmitted. Wait for runs to finish before
upgrades. If startup reports a database outage, restore the connection and restart the container so
recovery runs before accepting new training. A future multi-instance deployment requires a durable
worker, distributed capacity control, and shared object storage.

## Prepare an image and environment

On the VM, install Docker Engine with Compose and clone the repository. Use a DNS name pointing to
that VM. Copy `backend/.env.example` to `.env` and fill it locally. Required production values:

```dotenv
MINDMESH_ENV=production
MINDMESH_ORIGIN=https://mindmesh.example.com
MINDMESH_SECURE_COOKIES=true
MINDMESH_DATABASE_URL=postgresql+psycopg://USER:ENCODED_PASSWORD@EXACT_SUPABASE_HOST:5432/postgres?sslmode=require
MINDMESH_TRUST_PROXY_HEADERS=false
OPENAI_API_KEY=
MINDMESH_LLM_MODEL=gpt-4.1-mini
```

Use the exact direct or Session pooler URI from Supabase Connect. The Session pooler supports IPv4;
transaction pooling is unsupported because the runtime uses session search paths. Percent-encode
the password. Use the Supabase CA with `sslmode=verify-full` when managing certificate verification.
Never put these credentials in `VITE_*` variables, Docker build arguments, or the repository.

Optional elevated migration credentials and an existing runtime role are described in
[Supabase setup](supabase.md). Runtime access should be limited to the private schema. Do not expose
`mindmesh` in the Supabase Data API. Existing UUIDs are MindMesh account IDs, not Supabase Auth IDs.

```sh
docker compose build
# Run migration once with services stopped. It creates the private schema and revokes API roles.
docker compose run --rm mindmesh python -m alembic upgrade head
docker compose up -d
docker compose ps
curl --fail http://127.0.0.1:8000/api/ready
```

The image builds Vite's static frontend and serves it from FastAPI. Client routes such as `/model-lab`
return `index.html`, while `/api/*` remains API-only. Uploaded files and joblib artifacts are never
under the served frontend directory. The container runs as a non-root user.

## HTTPS and proxy

Install Caddy on the VM and use this Caddyfile, replacing the domain:

```caddyfile
mindmesh.example.com {
    request_body {
        max_size 27MB
    }
    reverse_proxy 127.0.0.1:8000
    header {
        X-Content-Type-Options nosniff
        Referrer-Policy same-origin
    }
}
```

Allow public ports 80 and 443 in the firewall. Compose binds API port 8000 to localhost only. Caddy
obtains TLS certificates. Register/login, API calls, and the React app share one HTTPS origin, so no
CORS configuration is needed. Production Secure session cookies are mandatory even though the
internal proxy connection is HTTP. Uvicorn runs with `--no-proxy-headers` to preserve the direct peer.

With IP forwarding disabled, authentication IP limits are shared by clients behind the proxy;
account operation limits still use each user's ID. To enable accurate authentication IP limits,
configure the proxy to overwrite X-Forwarded-For with the verified remote address, find the actual
container-visible proxy peer IP, and set `MINDMESH_TRUSTED_PROXY_IPS` to that exact address plus
`MINDMESH_TRUST_PROXY_HEADERS=true`. Do not use `*`, trust arbitrary internet peers, or enable
Uvicorn's independent forwarded-header parsing.

## Persistent files, backup, restore, upgrades

Compose mounts `mindmesh-data` at `/data`, containing `uploads/` and `models/`. Do not run
`docker compose down -v`, which deletes the named volume. Back up both the Supabase database and
this volume while the app is stopped, then restore them together. Database-only backups cannot
recover originals or fitted models. A container restart preserves the volume and database.

For the existing local SQLite cutover, follow [the stopped-service import and rollback procedure](supabase.md).
Transfer the contents of local `var/uploads` and `var/models` into their matching volume directories;
preserve filenames and make them writable by the container's `mindmesh` user. Test one original
download and one saved prediction after transfer. Never import user-uploaded pickles/joblib files.

Before upgrading, stop the app, back up the database and volume, rebuild, migrate, and start it.
Pin/reuse the built image for restarts. Fitted artifacts require the exact scikit-learn version that
created them; dependency updates can require retraining. Rollback means restoring the previous
image, matching database backup, and matching volume backup together.

`/api/health` is liveness without a database query. `/api/ready` queries an application table and
returns 503 if PostgreSQL is unavailable. Docker uses readiness as its health check; operators should
monitor it (Compose alone does not restart unhealthy containers). Database errors are sanitized and
private API responses use `Cache-Control: no-store`. Review logs without logging dataset rows,
prompts, passwords, tokens, or connection URLs.

## Optional assistant

Set `OPENAI_API_KEY` on the server and choose an available Responses API model using
`MINDMESH_LLM_MODEL`. Restart after changing `.env`. The integration uses the maintained OpenAI SDK,
30-second timeout, no automatic retries, `store=false`, no tools, at most 800 output tokens, and six
recent messages. Each conversation accepts at most 20 questions. Provider access, billing, quota,
and model availability belong to the operator; no configured key means honest static help.

Users explicitly send their question. Optional summaries must be previewed and enabled, and the
server rechecks ownership. Summaries omit row values, column names, filenames, account information,
and predictions. Questions/answers are saved privately; delete them from the assistant page. Provider
data handling remains subject to its account policies; `store=false` is not a zero-retention promise.
See [OpenAI text generation documentation](https://developers.openai.com/api/docs/guides/text).
