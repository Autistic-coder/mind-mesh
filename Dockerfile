FROM node:24-bookworm-slim AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig.json ./
COPY src ./src
COPY public ./public
RUN npx vite build

FROM python:3.11-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 \
    MINDMESH_SERVE_FRONTEND=true MINDMESH_UPLOAD_DIR=/data/uploads MINDMESH_MODEL_DIR=/data/models
WORKDIR /app
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt && useradd --create-home mindmesh && mkdir -p /data/uploads /data/models && chown -R mindmesh:mindmesh /data
COPY backend ./backend
COPY alembic.ini ./
COPY --from=frontend /app/dist ./dist
USER mindmesh
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=15s --start-period=30s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/ready', timeout=10)"
CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-proxy-headers", "--no-access-log"]
