# Free demo: Vercel, Render, and Neon PostgreSQL

No paid disk, object storage account, or paid LLM is required. PostgreSQL persists records and
complete dataset/model bytes. Editing deployment files does not publish the application.

## Deploy

1. Create a Neon **Free** project with a direct TLS connection. Follow [database setup and
   migration](database.md) to preserve existing records and files before switching connections.
2. Review and manually push the completed commit. Render/Vercel must see the new code on GitHub.
3. Import `render.yaml` through the [Render Blueprint page](https://dashboard.render.com/blueprint/new?repo=https://github.com/Autistic-coder/mind-mesh).
   Confirm the intended workspace. It declares **Free** compute, no disk, one Python API worker,
   and one training thread. Do not upgrade the plan to bypass free-tier limits.
4. Set `MINDMESH_DATABASE_URL` privately in Render to the new direct PostgreSQL URI and
   `MINDMESH_ORIGIN` to the intended Vercel production HTTPS origin. Keep Secure cookies on,
   frontend serving off, and forwarded-header trust off. Startup runs Alembic before Uvicorn.
   Configure a separate migration URI privately if using a different runtime role.
5. Import the repository into Vercel Hobby as `mindmesh` (or your preferred name). `vercel.json`
   builds Vite and generates Build Output API routes. Set the nonsecret Vercel variable
   `MINDMESH_BACKEND_URL` to the actual HTTPS Render service origin.
6. Confirm the actual Vercel hostname matches `MINDMESH_ORIGIN` in Render; update/restart if needed.
   Use separate test data and a separate backend for previews, not production private accounts.
7. Verify signup, login, refresh, uploads/downloads, training, predictions, and logout through the
   Vercel URL. Restart Render and check files/predictions again. Test another account in a separate
   browser profile. A frontend-only deployment is not a working full application.

The browser calls `/api/*` on Vercel; the deployment proxies those requests to Render. Other routes
serve the SPA. Cookies remain on the frontend origin, and private responses carry `no-store`.
Only the backend has database credentials. `.vercelignore` excludes secrets, private files, and
backend code from frontend uploads.

## Local preview

Run the two README startup commands, then open **http://127.0.0.1:5173**. To inspect deployment
artifacts after `npm run build`:

```powershell
$env:MINDMESH_BACKEND_URL = 'https://YOUR-ACTUAL-SERVICE.onrender.com'
node scripts/build-vercel.mjs
```

The generator requires an HTTPS origin without credentials, paths, or query strings. It writes
only ignored `.vercel/output` artifacts. Never upload `.env` with a frontend deployment.

## Free-tier constraints

- [Render Free](https://render.com/docs/free) sleeps after 15 idle minutes and can take about a
  minute to wake. Caches are disposable, but PostgreSQL retains file bytes. Use small demo data:
  512 MB RAM can run out during parsing/training. Interrupted jobs need resubmission.
- [Neon Free](https://neon.com/docs/introduction/plans) has finite compute/storage/transfer and
  idle scale-to-zero. Binary files count toward database storage. Check dashboard usage before a
  presentation, keep backups, and delete unwanted datasets/models through the application.
- [Vercel Hobby](https://vercel.com/docs/plans/hobby) is for personal/noncommercial projects with
  finite allowances. This setup is an educational demo, not always-on production hosting.
- Leave `OPENAI_API_KEY` unset for no paid LLM calls. Ask MindMesh shows labelled static help.
- Keep one API process. There is no durable/distributed training queue. Proxy trust is disabled,
  so login IP limits are shared behind the proxy; operation limits still apply per account.

Changing databases does not guarantee better speed. Measure deployed flows and keep a local
presentation fallback. Review spending controls and do not enable automatic paid upgrades. These
files do not delete the old hosting account or database.
