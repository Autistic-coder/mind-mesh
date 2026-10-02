"""Account-scoped project and dataset API."""

import json
import re
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field
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
