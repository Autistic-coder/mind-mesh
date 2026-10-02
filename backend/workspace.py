"""Account-scoped project and dataset API."""

import json
import re
from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from .auth import current_user, require_csrf
from .config import get_settings
from .database import get_db
from .dataset_files import MAX_BYTES, inspect_upload, validate_filename
from .models import Conversation, Dataset, Project, User, utcnow
from .models import Session as AccountSession

router = APIRouter(prefix="/api", tags=["workspace"])
STORED_NAME = re.compile(r"[0-9a-f]{32}\.(csv|xlsx)\Z")


class ProjectInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=500)


class ProjectChanges(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=500)


class DatasetAssignment(BaseModel):
    model_config = ConfigDict(extra="forbid")
    projectId: str | None


class LegacyProject(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(max_length=500)
    updatedAt: datetime


class LegacyColumn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=255)
    type: str = Field(pattern="^(number|category|text)$")
    missing: int = Field(ge=0, le=20000)
    uniqueCount: int = Field(ge=0, le=20000)
    values: list[str] = Field(max_length=30)


class LegacyDataset(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=255)
    projectId: str | None = None
    columns: list[LegacyColumn] = Field(min_length=1, max_length=100)
    rowCount: int = Field(ge=1, le=20000)
    preview: list[list[str | int | float]] = Field(max_length=25)
    createdAt: datetime

    @model_validator(mode="after")
    def valid_preview(self):
        if any(len(row) != len(self.columns) for row in self.preview):
            raise ValueError("Preview width must match the column count.")
        if any(len(str(cell)) > 1000 for row in self.preview for cell in row):
            raise ValueError("Preview cells must be 1,000 characters or fewer.")
        if any(len(value) > 1000 for column in self.columns for value in column.values):
            raise ValueError("Column examples must be 1,000 characters or fewer.")
        return self


class LegacyImport(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int = Field(ge=2, le=2)
    displayName: str = Field(min_length=1, max_length=80)
    projects: list[LegacyProject] = Field(max_length=200)
    datasets: list[LegacyDataset] = Field(max_length=100)

    @model_validator(mode="after")
    def valid_links(self):
        ids = [item.id for item in self.projects]
        dataset_ids = [item.id for item in self.datasets]
        if len(ids) != len(set(ids)) or len(dataset_ids) != len(set(dataset_ids)):
            raise ValueError("Legacy resource IDs must be unique.")
        if any(item.projectId is not None and item.projectId not in ids for item in self.datasets):
            raise ValueError("A dataset refers to a missing project.")
        return self


def project_json(project: Project) -> dict:
    return {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "updatedAt": project.updated_at.isoformat(),
    }


def dataset_json(dataset: Dataset) -> dict:
    return {
        "id": dataset.id,
        "name": dataset.name,
        "projectId": dataset.project_id,
        "columns": json.loads(dataset.columns_json),
        "rowCount": dataset.row_count,
        "preview": json.loads(dataset.preview_json),
        "createdAt": dataset.created_at.isoformat(),
        "hasFile": dataset.stored_name is not None,
    }


def owned_project(db: DbSession, user_id: str, project_id: str) -> Project:
    project = db.scalar(
        select(Project).where(Project.id == project_id, Project.owner_id == user_id)
    )
    if project is None:
        raise HTTPException(404, "Project not found.")
    return project


def owned_dataset(db: DbSession, user_id: str, dataset_id: str) -> Dataset:
    dataset = db.scalar(
        select(Dataset).where(Dataset.id == dataset_id, Dataset.owner_id == user_id)
    )
    if dataset is None:
        raise HTTPException(404, "Dataset not found.")
    return dataset


@router.get("/workspace")
def workspace(user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    projects = db.scalars(
        select(Project).where(Project.owner_id == user.id).order_by(Project.updated_at, Project.id)
    ).all()
    datasets = db.scalars(
        select(Dataset).where(Dataset.owner_id == user.id).order_by(Dataset.created_at, Dataset.id)
    ).all()
    return {
        "version": 2,
        "displayName": user.display_name,
        "projects": [project_json(item) for item in projects],
        "datasets": [dataset_json(item) for item in datasets],
    }


@router.post("/workspace/import", status_code=201)
def import_legacy_workspace(
    payload: LegacyImport,
    session: AccountSession = Depends(require_csrf),
    db: DbSession = Depends(get_db),
):
    """Copy user-selected browser records; original file bytes were never in that format."""
    project_ids: dict[str, str] = {}
    for source in payload.projects:
        project = Project(
            owner_id=session.user_id,
            name=source.name.strip(),
            description=source.description.strip(),
            updated_at=source.updatedAt,
        )
        if not project.name:
            raise HTTPException(400, "Imported projects need names.")
        db.add(project)
        db.flush()
        project_ids[source.id] = project.id
    for source in payload.datasets:
        db.add(
            Dataset(
                owner_id=session.user_id,
                project_id=project_ids.get(source.projectId),
                name=source.name.strip(),
                row_count=source.rowCount,
                columns_json=json.dumps([column.model_dump() for column in source.columns]),
                preview_json=json.dumps(source.preview),
                created_at=source.createdAt,
                stored_name=None,
            )
        )
    db.commit()
    return {"projectsImported": len(payload.projects), "datasetsImported": len(payload.datasets)}


@router.delete("/workspace", status_code=204)
def reset_workspace(
    session: AccountSession = Depends(require_csrf), db: DbSession = Depends(get_db)
):
    datasets = db.scalars(select(Dataset).where(Dataset.owner_id == session.user_id)).all()
    for conversation in db.scalars(
        select(Conversation).where(Conversation.owner_id == session.user_id)
    ):
        db.delete(conversation)
    for dataset in datasets:
        db.delete(dataset)
    for project in db.scalars(select(Project).where(Project.owner_id == session.user_id)):
        db.delete(project)
    db.commit()
    for dataset in datasets:
        if dataset.stored_name and STORED_NAME.fullmatch(dataset.stored_name):
            (get_settings().upload_dir / dataset.stored_name).unlink(missing_ok=True)


@router.get("/projects")
def list_projects(user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    return [
        project_json(item)
        for item in db.scalars(
            select(Project)
            .where(Project.owner_id == user.id)
            .order_by(Project.updated_at, Project.id)
        )
    ]


@router.post("/projects", status_code=201)
def create_project(
    payload: ProjectInput,
    session: AccountSession = Depends(require_csrf),
    db: DbSession = Depends(get_db),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, "Enter a project name.")
    project = Project(owner_id=session.user_id, name=name, description=payload.description.strip())
    db.add(project)
    db.commit()
    return project_json(project)


@router.get("/projects/{project_id}")
def get_project(
    project_id: str, user: User = Depends(current_user), db: DbSession = Depends(get_db)
):
    return project_json(owned_project(db, user.id, project_id))


@router.patch("/projects/{project_id}")
def update_project(
    project_id: str,
    payload: ProjectChanges,
    session: AccountSession = Depends(require_csrf),
    db: DbSession = Depends(get_db),
):
    project = owned_project(db, session.user_id, project_id)
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(400, "Enter a project name.")
        project.name = name
    if payload.description is not None:
        project.description = payload.description.strip()
    project.updated_at = utcnow()
    db.commit()
    return project_json(project)


@router.delete("/projects/{project_id}", status_code=204)
def delete_project(
    project_id: str,
    session: AccountSession = Depends(require_csrf),
    db: DbSession = Depends(get_db),
):
    project = owned_project(db, session.user_id, project_id)
    db.delete(project)
    db.commit()


@router.get("/datasets")
def list_datasets(user: User = Depends(current_user), db: DbSession = Depends(get_db)):
    return [
        dataset_json(item)
        for item in db.scalars(
            select(Dataset)
            .where(Dataset.owner_id == user.id)
            .order_by(Dataset.created_at, Dataset.id)
        )
    ]


@router.post("/datasets", status_code=201)
async def upload_dataset(
    file: UploadFile = File(...),
    sheet_name: str | None = Form(default=None),
    project_id: str | None = Form(default=None),
    session: AccountSession = Depends(require_csrf),
    db: DbSession = Depends(get_db),
):
    filename = file.filename
    _stem, extension = validate_filename(filename)
    if project_id:
        owned_project(db, session.user_id, project_id)
    chunks = bytearray()
    try:
        while block := await file.read(1024 * 1024):
            chunks.extend(block)
            if len(chunks) > MAX_BYTES:
                raise HTTPException(400, "Choose a file no larger than 5 MB.")
    finally:
        await file.close()
    summary = inspect_upload(filename, bytes(chunks), sheet_name)
    stored_name = f"{uuid4().hex}{extension}"
    upload_dir = get_settings().upload_dir
    upload_dir.mkdir(parents=True, exist_ok=True)
    stored_path = upload_dir / stored_name
    with stored_path.open("xb") as target:
        target.write(chunks)
    try:
        dataset = Dataset(
            owner_id=session.user_id,
            project_id=project_id,
            name=summary["name"],
            original_name=filename,
            stored_name=stored_name,
            content_type="text/csv"
            if extension == ".csv"
            else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            size_bytes=len(chunks),
            row_count=summary["rowCount"],
            columns_json=json.dumps(summary["columns"]),
            preview_json=json.dumps(summary["preview"]),
        )
        db.add(dataset)
        db.commit()
    except Exception:
        stored_path.unlink(missing_ok=True)
        raise
    return dataset_json(dataset)


@router.get("/datasets/{dataset_id}")
def get_dataset(
    dataset_id: str, user: User = Depends(current_user), db: DbSession = Depends(get_db)
):
    return dataset_json(owned_dataset(db, user.id, dataset_id))


@router.get("/datasets/{dataset_id}/preview")
def preview_dataset(
    dataset_id: str, user: User = Depends(current_user), db: DbSession = Depends(get_db)
):
    dataset = owned_dataset(db, user.id, dataset_id)
    return {
        "columns": json.loads(dataset.columns_json),
        "rowCount": dataset.row_count,
        "preview": json.loads(dataset.preview_json),
    }


@router.get("/datasets/{dataset_id}/download")
def download_dataset(
    dataset_id: str, user: User = Depends(current_user), db: DbSession = Depends(get_db)
):
    dataset = owned_dataset(db, user.id, dataset_id)
    if not dataset.stored_name or not STORED_NAME.fullmatch(dataset.stored_name):
        raise HTTPException(404, "Original file unavailable.")
    stored_path = get_settings().upload_dir / dataset.stored_name
    if not stored_path.is_file():
        raise HTTPException(404, "Original file unavailable.")
    return FileResponse(
        stored_path,
        filename=dataset.original_name,
        media_type="application/octet-stream",
        content_disposition_type="attachment",
    )


@router.patch("/datasets/{dataset_id}")
def assign_dataset(
    dataset_id: str,
    payload: DatasetAssignment,
    session: AccountSession = Depends(require_csrf),
    db: DbSession = Depends(get_db),
):
    dataset = owned_dataset(db, session.user_id, dataset_id)
    if payload.projectId:
        owned_project(db, session.user_id, payload.projectId)
    dataset.project_id = payload.projectId
    db.commit()
    return dataset_json(dataset)


@router.delete("/datasets/{dataset_id}", status_code=204)
def delete_dataset(
    dataset_id: str,
    session: AccountSession = Depends(require_csrf),
    db: DbSession = Depends(get_db),
):
    dataset = owned_dataset(db, session.user_id, dataset_id)
    stored_name = dataset.stored_name
    db.delete(dataset)
    db.commit()
    if stored_name and STORED_NAME.fullmatch(stored_name):
        (get_settings().upload_dir / stored_name).unlink(missing_ok=True)
