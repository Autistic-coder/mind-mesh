"""Generate deterministic, clearly synthetic MindMesh presentation datasets."""

import csv
import math
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "public" / "samples"


def write(name: str, headers: list[str], rows: list[list[object]]) -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    with (ROOT / name).open("w", encoding="utf-8", newline="") as target:
        writer = csv.writer(target)
        writer.writerow(headers)
        writer.writerows(rows)


def churn() -> None:
    rng = random.Random(20261006)
    rows = []
    cities = ["Delhi", "Pune", "Jaipur", "Kochi"]
    plans = ["Basic", "Plus", "Premium"]
    for index in range(160):
        tenure = rng.randint(1, 72)
        monthly = rng.randint(350, 2400)
        support = rng.randint(0, 7)
        city = rng.choice(cities)
        plan = rng.choice(plans)
        score = -1.5 + 0.34 * support + 0.0011 * monthly - 0.035 * tenure
        score += 0.45 if plan == "Basic" else -0.25 if plan == "Premium" else 0
        probability = 1 / (1 + math.exp(-score))
        label = "Yes" if rng.random() < probability else "No"
        rows.append([f"C{index + 1:04d}", tenure, monthly, support, city, plan, label])
    write(
        "customer-churn.csv",
        ["customer_id", "tenure_months", "monthly_spend", "support_calls", "city", "plan", "churn"],
        rows,
    )
    write(
        "customer-churn-batch.csv",
        ["tenure_months", "monthly_spend", "support_calls", "city", "plan"],
        [
            [8, 1650, 5, "Delhi", "Basic"],
            [48, 850, 1, "Pune", "Premium"],
            [20, "", 2, "Indore", "Plus"],
        ],
    )


def rent() -> None:
    rng = random.Random(20261006)
    rows = []
    areas = ["Central", "North", "South", "Suburb"]
    kinds = ["Apartment", "House"]
    for _index in range(160):
        size = rng.randint(420, 2200)
        bedrooms = rng.randint(1, 4)
        age = rng.randint(0, 30)
        area = rng.choice(areas)
        kind = rng.choice(kinds)
        location = {"Central": 9000, "North": 4500, "South": 6000, "Suburb": 1000}[area]
        rent_value = 4500 + size * 18 + bedrooms * 1600 - age * 110 + location
        rent_value += 2200 if kind == "House" else 0
        rent_value += rng.randint(-2600, 2600)
        rows.append([size, bedrooms, age, area, kind, max(5000, rent_value)])
    write(
        "rent-regression.csv",
        ["area_sq_ft", "bedrooms", "property_age", "neighborhood", "property_type", "monthly_rent"],
        rows,
    )
    write(
        "rent-regression-batch.csv",
        ["area_sq_ft", "bedrooms", "property_age", "neighborhood", "property_type"],
        [
            [850, 2, 8, "North", "Apartment"],
            [1500, 3, 2, "Central", "House"],
            [620, 1, "", "New area", "Apartment"],
        ],
    )


if __name__ == "__main__":
    churn()
    rent()
