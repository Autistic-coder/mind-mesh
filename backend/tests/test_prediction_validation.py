import pytest
from fastapi import HTTPException

from backend.ml_api import safe_csv_cell
from backend.ml_service import prediction_frame


def test_csv_formula_values_are_exported_as_text():
    for value in ["=1+1", " +SUM(A1)", "@command", "-cmd", "\t=1"]:
        assert safe_csv_cell(value) == "'" + value
    assert safe_csv_cell(-4.5) == -4.5
    assert safe_csv_cell("Delhi") == "Delhi"


def test_numeric_infinity_has_an_actionable_row_error():
    with pytest.raises(HTTPException) as error:
        prediction_frame(
            [{"age": "24"}, {"age": "inf"}],
            {"features": ["age"], "numericFeatures": ["age"], "categoricalFeatures": []},
        )
    assert error.value.status_code == 400
    assert "row 3" in error.value.detail
