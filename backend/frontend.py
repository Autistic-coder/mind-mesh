"""Serve the production Vite build on the API origin, with a safe SPA fallback."""

from pathlib import Path

from fastapi import HTTPException
from fastapi.responses import FileResponse


def install_frontend(app, directory: Path):
    root = directory.resolve()
    if not (root / "index.html").is_file():
        raise RuntimeError("Frontend build missing. Run npm run build before serving production.")

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str):
        if path == "api" or path.startswith("api/"):
            raise HTTPException(404, "API endpoint not found.")
        candidate = (root / path).resolve()
        if not candidate.is_relative_to(root):
            raise HTTPException(404, "File not found.")
        if candidate.is_file():
            return FileResponse(candidate, headers={"Cache-Control": "no-cache"})
        if path.startswith("assets/") or Path(path).suffix:
            raise HTTPException(404, "File not found.")
        return FileResponse(root / "index.html", headers={"Cache-Control": "no-store"})
