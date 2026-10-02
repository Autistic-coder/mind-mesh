"""Small, bounded CSV/XLSX inspection for persistent uploads."""

import csv
import io
import math
import zipfile
from datetime import date, datetime
from pathlib import PurePosixPath, PureWindowsPath
from xml.etree.ElementTree import ParseError

from fastapi import HTTPException
from openpyxl import load_workbook
from openpyxl.utils.exceptions import InvalidFileException

MAX_BYTES = 5 * 1024 * 1024
MAX_ROWS = 20_000
MAX_COLUMNS = 100
MAX_PREVIEW = 25
MAX_XLSX_UNCOMPRESSED = 50 * 1024 * 1024


def validate_filename(filename: str | None) -> tuple[str, str]:
    if not filename or len(filename) > 255 or not filename.isprintable():
        raise HTTPException(400, "Choose a file with a valid name.")
    if PurePosixPath(filename).name != filename or PureWindowsPath(filename).name != filename:
        raise HTTPException(400, "File names cannot contain a path.")
    dot = filename.rfind(".")
    if dot < 1 or filename[dot:].lower() not in {".csv", ".xlsx"}:
        raise HTTPException(400, "Choose a CSV or XLSX file.")
    return filename[:dot], filename[dot:].lower()


def _cell(value) -> str | int | float:
    if value is None:
        return ""
    if isinstance(value, bool):
        return str(value).lower()
    if isinstance(value, (int, float)) and math.isfinite(value):
        return value
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return str(value).strip()


def _number(value: str | int | float) -> bool:
    try:
        return math.isfinite(float(value))
    except (ValueError, TypeError, OverflowError):
        return False


def _summarize(name: str, rows) -> dict:
    headers = None
    preview = []
    missing = []
    unique = []
    numeric = []
    row_count = 0
    for raw in rows:
        row = [_cell(cell) for cell in raw]
        if not any(str(cell).strip() for cell in row):
            continue
        if headers is None:
            headers = [str(cell).strip() for cell in row]
            if not headers or len(headers) > MAX_COLUMNS:
                raise HTTPException(400, "Use a dataset with 1 to 100 columns.")
            if any(not header for header in headers):
                raise HTTPException(400, "Every column needs a non-empty header.")
            if len({header.casefold() for header in headers}) != len(headers):
                raise HTTPException(400, "Column headers must be unique (ignoring case).")
            missing = [0] * len(headers)
            unique = [dict() for _ in headers]
            numeric = [True] * len(headers)
            continue
        if len(row) != len(headers):
            raise HTTPException(400, "Each row must match the number of columns in the header.")
        row_count += 1
        if row_count > MAX_ROWS:
            raise HTTPException(400, "Use a dataset with 20,000 rows or fewer.")
        if len(preview) < MAX_PREVIEW:
            preview.append(row)
        for index, cell in enumerate(row):
            if cell == "":
                missing[index] += 1
            else:
                unique[index][str(cell)] = None
                if not _number(cell):
                    numeric[index] = False
    if headers is None or row_count == 0:
        raise HTTPException(400, "Include a header row and at least one data row.")
    columns = [
        {
            "name": header,
            "type": "number"
            if numeric[index] and len(unique[index])
            else "category"
            if len(unique[index]) <= 30
            else "text",
            "missing": missing[index],
            "uniqueCount": len(unique[index]),
            "values": list(unique[index])[:30],
        }
        for index, header in enumerate(headers)
    ]
    return {"name": name, "rowCount": row_count, "columns": columns, "preview": preview}


def inspect_upload(filename: str, data: bytes, sheet_name: str | None = None) -> dict:
    stem, extension = validate_filename(filename)
    if not data or len(data) > MAX_BYTES:
        raise HTTPException(400, "Choose a file no larger than 5 MB.")
    if extension == ".csv":
        if sheet_name:
            raise HTTPException(400, "A worksheet can only be selected for XLSX files.")
        try:
            text = data.decode("utf-8-sig")
            if "\x00" in text:
                raise HTTPException(400, "This is not a valid text CSV file.")
            return _summarize(stem, csv.reader(io.StringIO(text, newline=""), strict=True))
        except (UnicodeDecodeError, csv.Error) as error:
            raise HTTPException(400, "This CSV file could not be read as UTF-8.") from error

    if not zipfile.is_zipfile(io.BytesIO(data)):
        raise HTTPException(400, "This is not a valid XLSX workbook.")
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            members = archive.infolist()
            if (
                len(members) > 2_000
                or sum(member.file_size for member in members) > MAX_XLSX_UNCOMPRESSED
            ):
                raise HTTPException(400, "This workbook is too large to inspect safely.")
        workbook = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        try:
            if sheet_name and sheet_name not in workbook.sheetnames:
                raise HTTPException(400, "Choose an available worksheet.")
            if not sheet_name and len(workbook.sheetnames) > 1:
                raise HTTPException(400, "Choose a worksheet from this workbook.")
            chosen = sheet_name or workbook.sheetnames[0]
            sheet = workbook[chosen]
            if sheet.max_column > MAX_COLUMNS or sheet.max_row > MAX_ROWS + 1:
                raise HTTPException(
                    400, "Use a worksheet with 20,000 rows and 100 columns or fewer."
                )
            label = f"{stem} · {chosen}" if len(workbook.sheetnames) > 1 else stem
            return _summarize(label, sheet.iter_rows(values_only=True))
        finally:
            workbook.close()
    except (
        ValueError,
        KeyError,
        zipfile.BadZipFile,
        OSError,
        IndexError,
        InvalidFileException,
        ParseError,
    ) as error:
        raise HTTPException(400, "This XLSX workbook could not be read.") from error
