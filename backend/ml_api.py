"""Authenticated training, model, and prediction endpoints."""

import csv
import io
import json
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import current_user, require_csrf
from .config import get_settings
from .database import get_db
from .ml_service import (
    MAX_BATCH_BYTES,
    MAX_BATCH_ROWS,
    dataset_schema,
    load_pipeline,
    model_artifact_paths,
    predict_records,
    submit_run,
    validate_config,
)
from .models import Dataset, ModelMetadata, Prediction, TrainingConfig, TrainingRun, User
from .models import Session as AccountSession
from .rate_limits import user_limit

router = APIRouter(prefix="/api/ml", tags=["machine-learning"])


class RunInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    datasetId: str
    task: str
    target: str
    features: list[str]
    algorithms: list[str]
    testSize: float = Field(default=0.2)
    randomSeed: int = Field(default=42, ge=0, le=2_147_483_647)


class SinglePredictionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    record: dict[str, str | int | float | bool | None]


def owned_dataset(db: Session, owner_id: str, dataset_id: str) -> Dataset:
    dataset = db.scalar(
        select(Dataset).where(Dataset.id == dataset_id, Dataset.owner_id == owner_id)
    )
    if dataset is None:
        raise HTTPException(404, "Dataset not found.")
    return dataset


def owned_run(db: Session, owner_id: str, run_id: str) -> TrainingRun:
    run = db.scalar(
        select(TrainingRun).where(TrainingRun.id == run_id, TrainingRun.owner_id == owner_id)
    )
    if run is None:
        raise HTTPException(404, "Training run not found.")
    return run


def owned_model(db: Session, owner_id: str, model_id: str) -> ModelMetadata:
    model = db.scalar(
        select(ModelMetadata).where(
            ModelMetadata.id == model_id, ModelMetadata.owner_id == owner_id
        )
    )
    if model is None:
        raise HTTPException(404, "Saved model not found.")
    return model


def public_metadata(model: ModelMetadata) -> dict:
    metadata = json.loads(model.metadata_json)
    metadata.pop("artifactName", None)
    return {
        "id": model.id,
        "runId": model.run_id,
        "createdAt": model.created_at.isoformat(),
        **metadata,
    }


def run_json(db: Session, run: TrainingRun) -> dict:
    config = db.get(TrainingConfig, run.config_id)
    return {
        "id": run.id,
        "status": run.status,
        "createdAt": run.created_at.isoformat(),
        "datasetId": config.dataset_id,
        "projectId": config.project_id,
        "config": json.loads(config.config_json),
        "result": json.loads(run.result_json) if run.result_json else None,
    }


@router.get("/datasets/{dataset_id}/schema")
def get_dataset_schema(
    dataset_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    return dataset_schema(owned_dataset(db, user.id, dataset_id))


@router.get("/runs")
def list_runs(
    datasetId: str | None = Query(default=None),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    query = (
        select(TrainingRun)
        .where(TrainingRun.owner_id == user.id)
        .order_by(TrainingRun.created_at.desc())
    )
    if datasetId:
        query = query.join(TrainingConfig, TrainingRun.config_id == TrainingConfig.id).where(
            TrainingConfig.dataset_id == datasetId
        )
    return [run_json(db, item) for item in db.scalars(query)]


@router.post("/runs", status_code=202)
def create_run(
    payload: RunInput,
    session: AccountSession = Depends(require_csrf),
    db: Session = Depends(get_db),
):
    user_limit("training-run", session.user_id, get_settings().rate_train_minute)
    dataset = owned_dataset(db, session.user_id, payload.datasetId)
    if not dataset.stored_name:
        raise HTTPException(
            400, "Preview-only datasets cannot be trained. Re-upload the original file."
        )
    stored_path = get_settings().upload_dir / dataset.stored_name
    if not stored_path.is_file():
        raise HTTPException(
            409, "The original dataset file is missing. Re-upload it before training."
        )
    active = db.scalar(
        select(TrainingRun.id)
        .join(TrainingConfig, TrainingRun.config_id == TrainingConfig.id)
        .where(
            TrainingRun.owner_id == session.user_id,
            TrainingConfig.dataset_id == dataset.id,
            TrainingRun.status.in_(["queued", "running"]),
        )
    )
    if active:
        raise HTTPException(409, "This dataset already has an active training run.")
    config = payload.model_dump()
    config["missingHandling"] = {
        "numeric": "median from training rows",
        "categorical": "most frequent value from training rows",
        "target": "rows omitted",
    }
    validate_config(dataset, config)
    record = TrainingConfig(
        owner_id=session.user_id,
        project_id=dataset.project_id,
        dataset_id=dataset.id,
        config_json=json.dumps(config),
    )
    db.add(record)
    db.flush()
    run = TrainingRun(owner_id=session.user_id, config_id=record.id, status="queued")
    db.add(run)
    db.commit()
    submit_run(run.id)
    return run_json(db, run)


@router.get("/runs/{run_id}")
def get_run(run_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return run_json(db, owned_run(db, user.id, run_id))


@router.delete("/runs/{run_id}", status_code=204)
def delete_run(
    run_id: str,
    session: AccountSession = Depends(require_csrf),
    db: Session = Depends(get_db),
):
    run = owned_run(db, session.user_id, run_id)
    if run.status in {"queued", "running"}:
        raise HTTPException(409, "Wait for this training run to finish before removing it.")
    moved = []
    try:
        for original in model_artifact_paths(db, run_id=run.id):
            if original.is_file():
                hidden = original.with_name(f".{uuid4().hex}.delete")
                original.replace(hidden)
                moved.append((original, hidden))
        config = db.get(TrainingConfig, run.config_id)
        db.delete(run)
        db.delete(config)
        db.commit()
    except Exception:
        db.rollback()
        for original, hidden in reversed(moved):
            hidden.replace(original)
        raise
    for _original, hidden in moved:
        hidden.unlink(missing_ok=True)


@router.get("/models")
def list_models(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return [
        public_metadata(item)
        for item in db.scalars(
            select(ModelMetadata)
            .where(ModelMetadata.owner_id == user.id)
            .order_by(ModelMetadata.created_at.desc())
        )
    ]


@router.get("/models/{model_id}")
def get_model(model_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return public_metadata(owned_model(db, user.id, model_id))


@router.post("/models/{model_id}/select")
def select_model(
    model_id: str,
    session: AccountSession = Depends(require_csrf),
    db: Session = Depends(get_db),
):
    chosen = owned_model(db, session.user_id, model_id)
    for model in db.scalars(
        select(ModelMetadata).where(
            ModelMetadata.owner_id == session.user_id, ModelMetadata.run_id == chosen.run_id
        )
    ):
        metadata = json.loads(model.metadata_json)
        metadata["selected"] = model.id == chosen.id
        model.metadata_json = json.dumps(metadata)
    db.commit()
    return public_metadata(chosen)


def save_prediction(db: Session, owner_id: str, model_id: str, inputs, outputs) -> Prediction:
    record = Prediction(
        owner_id=owner_id,
        model_id=model_id,
        input_json=json.dumps(inputs, default=str),
        output_json=json.dumps(outputs, default=str),
    )
    db.add(record)
    db.commit()
    return record


@router.post("/models/{model_id}/predict")
def predict_single(
    model_id: str,
    payload: SinglePredictionInput,
    session: AccountSession = Depends(require_csrf),
    db: Session = Depends(get_db),
):
    user_limit("prediction", session.user_id, get_settings().rate_predict_minute)
    model = owned_model(db, session.user_id, model_id)
    metadata = json.loads(model.metadata_json)
    outputs = predict_records(load_pipeline(metadata), metadata, [payload.record])
    history = save_prediction(db, session.user_id, model.id, payload.record, outputs[0])
    return {"id": history.id, **outputs[0], "createdAt": history.created_at.isoformat()}


@router.post("/models/{model_id}/predict-batch")
async def predict_batch(
    model_id: str,
    file: UploadFile = File(...),
    session: AccountSession = Depends(require_csrf),
    db: Session = Depends(get_db),
):
    user_limit(
        "batch-prediction", session.user_id, get_settings().rate_batch_predict_minute
    )
    model = owned_model(db, session.user_id, model_id)
    filename = file.filename or ""
    if not filename.lower().endswith(".csv") or Path(filename).name != filename:
        raise HTTPException(400, "Choose a CSV batch file with a valid filename.")
    contents = await file.read(MAX_BATCH_BYTES + 1)
    await file.close()
    if len(contents) > MAX_BATCH_BYTES:
        raise HTTPException(400, "Choose a batch CSV no larger than 5 MB.")
    try:
        text = contents.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text, newline=""), strict=True)
        if not reader.fieldnames or any(not name for name in reader.fieldnames):
            raise ValueError
        if len(set(reader.fieldnames)) != len(reader.fieldnames):
            raise HTTPException(400, "Batch CSV headers must be unique.")
        records = list(reader)
    except (UnicodeDecodeError, csv.Error, ValueError) as error:
        raise HTTPException(400, "This batch CSV could not be read as UTF-8.") from error
    if not records:
        raise HTTPException(400, "The batch CSV needs at least one data row.")
    if len(records) > MAX_BATCH_ROWS:
        raise HTTPException(400, f"Batch prediction supports up to {MAX_BATCH_ROWS:,} rows.")
    metadata = json.loads(model.metadata_json)
    outputs = predict_records(load_pipeline(metadata), metadata, records)
    history = save_prediction(
        db,
        session.user_id,
        model.id,
        {"filename": filename, "rows": records},
        outputs,
    )
    destination = io.StringIO(newline="")
    probability_labels = list(outputs[0].get("probabilities", {}))
    fields = [
        *reader.fieldnames,
        "prediction",
        *[f"probability_{label}" for label in probability_labels],
    ]
    writer = csv.DictWriter(destination, fieldnames=fields)
    writer.writeheader()
    for source, output in zip(records, outputs, strict=True):
        row = {**source, "prediction": output["prediction"]}
        row.update(
            {f"probability_{label}": output["probabilities"][label] for label in probability_labels}
        )
        writer.writerow(row)
    return Response(
        destination.getvalue().encode("utf-8"),
        media_type="text/csv",
        headers={
            "Content-Disposition": 'attachment; filename="mindmesh-predictions.csv"',
            "X-MindMesh-Prediction-Id": history.id,
        },
    )


@router.get("/predictions")
def list_predictions(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return [
        {
            "id": item.id,
            "modelId": item.model_id,
            "input": json.loads(item.input_json),
            "output": json.loads(item.output_json),
            "createdAt": item.created_at.isoformat(),
        }
        for item in db.scalars(
            select(Prediction)
            .where(Prediction.owner_id == user.id)
            .order_by(Prediction.created_at.desc())
        )
    ]
