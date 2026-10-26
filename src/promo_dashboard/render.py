from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from .analysis import DIMENSION_LABELS, diagnose, product_plan_links


def build_payload(datasets: list[dict[str, Any]], warnings: list[str]) -> dict[str, Any]:
    return {
        "generated_at": datetime.now().astimezone().isoformat(timespec="minutes"),
        "datasets": datasets,
        "warnings": warnings,
        "dimension_labels": DIMENSION_LABELS,
        "product_plan_links": product_plan_links(datasets),
        "diagnostics": {item["id"]: diagnose(item, _source_totals(item)) for item in datasets},
    }


def _source_totals(dataset: dict[str, Any]) -> dict[str, float]:
    totals: dict[str, float] = {}
    for row in dataset["rows"]:
        for key, value in row["metrics"].items():
            if value is not None:
                totals[key] = totals.get(key, 0.0) + float(value)
    return totals


def render_html(payload: dict[str, Any], template_path: str | Path | None = None) -> str:
    if template_path is None:
        template_path = Path(__file__).resolve().with_name("report-template.html")
    template = Path(template_path).read_text(encoding="utf-8")
    template_dir = Path(template_path).resolve().parent
    dashboard_js = (template_dir / "dashboard.js").read_text(encoding="utf-8")
    dashboard_css = (template_dir / "dashboard.css").read_text(encoding="utf-8")
    data = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    # Avoid ending the application/json element early and preserve JS parsing.
    data = data.replace("</", "<\\/").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    return (
        template.replace("__REPORT_DATA__", data)
        .replace("__DASHBOARD_JS__", dashboard_js)
        .replace("__DASHBOARD_CSS__", dashboard_css)
    )
