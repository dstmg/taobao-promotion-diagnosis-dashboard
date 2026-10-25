from __future__ import annotations

from collections import defaultdict
from statistics import median
from typing import Any

DIMENSION_LABELS = {
    "date": "日期", "product_id": "商品 ID", "product_name": "商品名称",
    "scene_id": "场景 ID", "scene_name": "营销场景", "plan_id": "计划 ID",
    "plan_name": "计划名称", "unit_id": "单元 ID", "unit_name": "单元名称",
    "audience_id": "人群 ID", "audience_name": "人群名称", "creative_id": "创意 ID",
    "creative_name": "创意名称", "keyword_type": "词类型", "keyword_id": "词 ID",
    "keyword_name": "关键词", "province": "地域",
}

DEFAULT_GROUPS = {
    "product": ["product_id", "product_name"],
    "plan": ["plan_id", "plan_name"],
    "scene": ["scene_id", "scene_name"],
    "audience": ["audience_name"], "creative": ["creative_id", "creative_name"],
    "region": ["province"], "unit": ["unit_id", "unit_name"],
    "keyword": ["keyword_type", "keyword_name", "keyword_id"],
    "unknown": [],
}

def aggregate_rows(
    dataset: dict[str, Any],
    *,
    filters: dict[str, str] | None = None,
    group_by: list[str] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, float], list[str]]:
    """Filter and aggregate exactly one source dataset; never combine report types."""
    filters = filters or {}
    rows = dataset["rows"]
    dimensions_available = set(dataset["dimensions_available"])
    active_filters = {key: value.strip().casefold() for key, value in filters.items() if value.strip()}
    selected = []
    for row in rows:
        dims = row["dimensions"]
        matched = True
        for key, query in active_filters.items():
            if key == "search":
                haystack = " ".join(str(value or "") for value in dims.values()).casefold()
                if query not in haystack:
                    matched = False
                    break
            elif key == "date_start":
                if not dims.get("date") or dims["date"] < query:
                    matched = False
                    break
            elif key == "date_end":
                if not dims.get("date") or dims["date"] > query:
                    matched = False
                    break
            elif key in dimensions_available and query not in str(dims.get(key, "")).casefold():
                matched = False
                break
        if matched:
            selected.append(row)

    group_by = [key for key in (group_by or DEFAULT_GROUPS.get(dataset["type"], [])) if key in dimensions_available]
    grouped: dict[tuple[Any, ...], dict[str, Any]] = {}
    for row in selected:
        dims = row["dimensions"]
        key = tuple(dims.get(name) for name in group_by)
        if key not in grouped:
            grouped[key] = {
                "dimensions": {name: dims.get(name) for name in group_by},
                "metrics": defaultdict(float), "custom_sums": defaultdict(float),
                "custom_counts": defaultdict(int), "custom_metrics": {}, "source_rows": 0,
            }
        target = grouped[key]
        target["source_rows"] += 1
        for metric, value in row["metrics"].items():
            if value is not None:
                target["metrics"][metric] += float(value)
        for metric, value in row["custom_metrics"].items():
            target["custom_sums"][metric] += float(value)
            target["custom_counts"][metric] += 1

    custom_meta = dataset.get("custom_metric_meta", {})
    for target in grouped.values():
        for metric, value in target["custom_sums"].items():
            if custom_meta.get(metric, {}).get("aggregation") == "mean":
                target["custom_metrics"][metric] = value / target["custom_counts"][metric]
            else:
                target["custom_metrics"][metric] = value

    result = list(grouped.values())
    for row in result:
        _derive_rates(row["metrics"])
    totals: dict[str, float] = defaultdict(float)
    for row in selected:
        for metric, value in row["metrics"].items():
            if value is not None:
                totals[metric] += float(value)
    custom_sums: dict[str, float] = defaultdict(float)
    custom_counts: dict[str, int] = defaultdict(int)
    for row in selected:
        for name, value in row["custom_metrics"].items():
            custom_sums[name] += float(value)
            custom_counts[name] += 1
    for name, value in custom_sums.items():
        totals[f"custom:{name}"] = value / custom_counts[name] if custom_meta.get(name, {}).get("aggregation") == "mean" else value
    _derive_rates(totals)
    return result, dict(totals), [key for key in group_by]


def _derive_rates(metrics: dict[str, Any]) -> None:
    spend = metrics.get("spend")
    clicks = metrics.get("clicks")
    impressions = metrics.get("impressions")
    direct_amount = metrics.get("direct_amount")
    total_amount = metrics.get("total_amount")
    direct_orders = metrics.get("direct_orders")

    def ratio(numerator: Any, denominator: Any) -> float | None:
        if not isinstance(numerator, (int, float)) or not isinstance(denominator, (int, float)) or denominator == 0:
            return None
        return float(numerator) / float(denominator)

    metrics["direct_roi"] = ratio(direct_amount, spend)
    metrics["total_roi"] = ratio(total_amount, spend)
    metrics["cpc"] = ratio(spend, clicks)
    metrics["ctr"] = ratio(clicks, impressions)
    metrics["direct_cvr"] = ratio(direct_orders, clicks)
    metrics["direct_cpa"] = ratio(spend, direct_orders)


def diagnose(dataset: dict[str, Any], totals: dict[str, float]) -> list[dict[str, str]]:
    spend = totals.get("spend")
    direct_amount = totals.get("direct_amount")
    clicks = totals.get("clicks")
    direct_orders = totals.get("direct_orders")
    findings: list[dict[str, str]] = []
    if not dataset.get("date_start"):
        findings.append({"level": "info", "title": "缺少可识别日期", "detail": "无法核对报表覆盖区间；请检查日期列或导出范围。"})
    if isinstance(spend, (int, float)) and spend > 0 and direct_amount == 0:
        findings.append({"level": "alert", "title": "有花费但无直接成交金额", "detail": "当前筛选范围内花费大于 0、直接成交金额为 0；建议先检查点击、转化和归因窗口。"})
    if isinstance(clicks, (int, float)) and clicks > 0 and direct_orders == 0:
        findings.append({"level": "watch", "title": "有点击但无直接成交笔数", "detail": "当前范围有点击但没有直接成交笔数；先结合商品页、词、人群或地域明细定位。"})
    roi = direct_amount / spend if isinstance(direct_amount, (int, float)) and isinstance(spend, (int, float)) and spend else None
    if roi is not None and roi < 1:
        findings.append({"level": "watch", "title": "直接 ROI 低于 1", "detail": "直接成交金额 ÷ 花费低于 1。该比值不等于利润率，需结合毛利、退款和间接成交判断。"})
    if spend == 0 and clicks == 0:
        findings.append({"level": "info", "title": "当前范围没有投放消耗", "detail": "请确认日期范围、报表类型和筛选条件。"})
    if not findings:
        findings.append({"level": "good", "title": "未触发基础异常规则", "detail": "这不代表投放一定健康；可继续查看趋势及商品、计划和其他维度明细。"})
    return findings


def product_plan_links(datasets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return only exact product-plan pairs present in product or keyword source rows."""
    candidates = [
        item for kind in ("product", "keyword") for item in datasets
        if item["type"] == kind
        and "product_id" in item["dimensions_available"]
        and "plan_id" in item["dimensions_available"]
    ]
    if not candidates:
        return []
    # Use the richest single product dataset, falling back to one keyword
    # dataset only if product rows do not contain exact product-plan pairs.
    candidates.sort(key=lambda item: (item["type"] != "product", -item["row_count"]))
    dataset = next((item for item in candidates if any(row["dimensions"].get("product_id") and row["dimensions"].get("plan_id") for row in item["rows"])), None)
    if dataset is None:
        return []
    # Product and keyword reports are parallel breakdowns of the same delivery
    # and must never be summed together.
    links: dict[tuple[str, str, str, str], dict[str, Any]] = {}
    for row in dataset["rows"]:
        dims, metrics = row["dimensions"], row["metrics"]
        product_id, plan_id = dims.get("product_id"), dims.get("plan_id")
        if not product_id or not plan_id:
            continue
        key = (str(product_id), str(plan_id))
        target = links.setdefault(key, {
            "product_id": key[0], "plan_id": key[1], "product_name": "", "plan_name": "",
            "product_name_variants": set(), "plan_name_variants": set(),
            "metrics": defaultdict(float), "evidence_reports": {dataset["label"]},
        })
        if dims.get("product_name"):
            target["product_name_variants"].add(str(dims["product_name"]))
        if dims.get("plan_name"):
            target["plan_name_variants"].add(str(dims["plan_name"]))
        for metric, value in metrics.items():
            if value is not None:
                target["metrics"][metric] += float(value)
    result = []
    for link in links.values():
        link["product_name_variants"] = sorted(link["product_name_variants"])
        link["plan_name_variants"] = sorted(link["plan_name_variants"])
        link["product_name"] = link["product_name_variants"][0] if link["product_name_variants"] else ""
        link["plan_name"] = link["plan_name_variants"][0] if link["plan_name_variants"] else ""
        _derive_rates(link["metrics"])
        link["metrics"] = dict(link["metrics"])
        link["evidence_reports"] = sorted(link["evidence_reports"])
        result.append(link)
    return result


def compare_within_dataset(rows: list[dict[str, Any]], metric: str) -> dict[str, Any]:
    values = [float(row["metrics"][metric]) for row in rows if isinstance(row["metrics"].get(metric), (int, float))]
    return {"median": median(values) if values else None, "count": len(values)}
