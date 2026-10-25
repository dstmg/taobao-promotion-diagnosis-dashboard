from __future__ import annotations

import math
import re
import unicodedata
from datetime import date, datetime
from typing import Any


TYPE_LABELS = {
    "product": "商品",
    "plan": "计划",
    "scene": "营销场景",
    "audience": "人群",
    "creative": "创意",
    "region": "地域",
    "unit": "单元",
    "keyword": "关键词",
    "unknown": "未分类",
}

DIMENSION_ALIASES = {
    "date": ("日期", "统计日期", "时间"),
    "product_id": ("主体ID", "宝贝ID", "商品ID", "产品ID"),
    "product_name": ("主体名称", "宝贝名称", "商品名称", "商品标题"),
    "scene_id": ("场景ID", "营销场景ID"),
    "scene_name": ("场景名字", "场景名称", "营销场景名称"),
    "plan_id": ("计划ID", "推广计划ID"),
    "plan_name": ("计划名字", "计划名称"),
    "unit_id": ("单元ID", "推广单元ID"),
    "unit_name": ("单元名字", "单元名称"),
    "audience_id": ("人群ID", "定向人群ID"),
    "audience_name": ("人群名字", "人群名称", "人群"),
    "creative_id": ("创意ID", "素材ID"),
    "creative_name": ("创意名字", "创意名称", "素材名称"),
    "keyword_type": ("词类型", "关键词类型"),
    "keyword_id": ("词ID/词包ID", "关键词ID", "搜索词ID"),
    "keyword_name": ("词名字/词包名字", "关键词名称", "关键词", "搜索词", "投放词"),
    "province": ("省", "省份", "地域", "地区"),
}

METRIC_ALIASES = {
    "impressions": ("展现量", "曝光量", "展现次数"),
    "clicks": ("点击量", "点击次数"),
    "spend": ("花费", "消耗", "推广花费", "总花费"),
    "direct_amount": ("直接成交金额", "直接成交额", "直接支付金额"),
    "total_amount": ("总成交金额", "总成交额", "总支付金额"),
    "direct_orders": ("直接成交笔数", "直接成交订单数"),
    "total_orders": ("总成交笔数", "总成交订单数"),
    "presale_direct_amount": ("直接预售成交金额",),
    "presale_total_amount": ("总预售成交金额",),
    "presale_direct_orders": ("直接预售成交笔数",),
    "presale_total_orders": ("总预售成交笔数",),
    "cart": ("总购物车数", "购物车数"),
    "favorites": ("总收藏数", "收藏宝贝数", "商品收藏数"),
}

METRIC_LABELS = {
    "impressions": "展现量",
    "clicks": "点击量",
    "spend": "花费",
    "direct_amount": "直接成交金额",
    "total_amount": "总成交金额",
    "direct_orders": "直接成交笔数",
    "total_orders": "总成交笔数",
    "presale_direct_amount": "直接预售成交金额",
    "presale_total_amount": "总预售成交金额",
    "presale_direct_orders": "直接预售成交笔数",
    "presale_total_orders": "总预售成交笔数",
    "cart": "总购物车数",
    "favorites": "收藏宝贝数",
}


def normalize_header(value: Any) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).casefold()
    return re.sub(r"[\s\u3000.,，。:：;；/／_（）()\-—]+", "", text)


def _header_lookup(headers: list[str]) -> dict[str, str]:
    result: dict[str, str] = {}
    for header in headers:
        result.setdefault(normalize_header(header), header)
    return result


def resolve_headers(headers: list[str]) -> tuple[dict[str, str], dict[str, str]]:
    lookup = _header_lookup(headers)
    dimensions: dict[str, str] = {}
    metrics: dict[str, str] = {}
    for canonical, aliases in DIMENSION_ALIASES.items():
        for alias in aliases:
            key = normalize_header(alias)
            if key in lookup:
                dimensions[canonical] = lookup[key]
                break
    for canonical, aliases in METRIC_ALIASES.items():
        for alias in aliases:
            key = normalize_header(alias)
            if key in lookup:
                metrics[canonical] = lookup[key]
                break
    return dimensions, metrics


def infer_report_type(headers: list[str], source_name: str) -> str:
    name = unicodedata.normalize("NFKC", source_name).casefold()
    for hint, report_type in (
        ("关键词", "keyword"), ("关键字", "keyword"), ("词包", "keyword"),
        ("人群", "audience"), ("创意", "creative"), ("地域", "region"),
        ("单元", "unit"), ("营销场景", "scene"), ("场景报表", "scene"),
        ("计划", "plan"), ("商品", "product"), ("宝贝", "product"),
    ):
        if hint in name:
            return report_type

    dimensions, _ = resolve_headers(headers)
    if "keyword_name" in dimensions or "keyword_id" in dimensions:
        return "keyword"
    if "audience_name" in dimensions:
        return "audience"
    if "creative_id" in dimensions or "creative_name" in dimensions:
        return "creative"
    if "province" in dimensions:
        return "region"
    if "unit_id" in dimensions or "unit_name" in dimensions:
        return "unit"
    if "product_id" in dimensions or "product_name" in dimensions:
        return "product"
    if "plan_id" in dimensions or "plan_name" in dimensions:
        return "plan"
    if "scene_id" in dimensions or "scene_name" in dimensions:
        return "scene"
    return "unknown"


def parse_number(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)):
        number = float(value)
        return number if math.isfinite(number) else None
    text = unicodedata.normalize("NFKC", str(value)).strip()
    if text in {"", "-", "--", "—", "－", "N/A", "无"}:
        return None
    is_percent = text.endswith("%")
    is_ratio = text.casefold().endswith("x") or text.endswith("倍")
    if is_ratio:
        text = text[:-1].strip()
    text = text.replace(",", "").replace("，", "").replace("¥", "").replace("￥", "")
    text = text.replace("元", "").replace("%", "").replace("次", "").replace("个", "").strip()
    try:
        number = float(text)
    except ValueError:
        return None
    if not math.isfinite(number):
        return None
    return number / 100 if is_percent else number


def parse_date(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = unicodedata.normalize("NFKC", str(value)).strip()
    if not text:
        return None
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d", "%Y%m%d"):
        try:
            return datetime.strptime(text[:10], fmt).date().isoformat()
        except ValueError:
            continue
    match = re.search(r"(20\d{2})\D{0,2}(\d{1,2})\D{0,2}(\d{1,2})", text)
    if match:
        try:
            return date(*(int(part) for part in match.groups())).isoformat()
        except ValueError:
            return None
    return None


def _custom_metric_meta(header: str) -> dict[str, str]:
    key = normalize_header(header).upper()
    is_percent = any(term in key for term in ("率", "占比", "比例", "CTR", "CVR")) or "%" in header
    is_ratio = any(term in key for term in ("ROI", "投产", "倍"))
    is_average = is_percent or is_ratio or any(term in key for term in ("平均", "均价", "单价", "均值", "CPC", "CPA"))
    is_money = any(term in key for term in ("金额", "费用", "花费", "单价", "均价", "成本", "CPC", "CPA"))
    return {
        "aggregation": "mean" if is_average else "sum",
        "format": "percent" if is_percent else "ratio" if is_ratio else "money" if is_money else "number",
    }


def normalize_dataset(parsed: dict[str, Any], ordinal: int = 1) -> dict[str, Any]:
    headers = parsed["headers"]
    dimensions_map, metrics_map = resolve_headers(headers)
    report_type = infer_report_type(headers, parsed.get("classification_name") or parsed["source_name"])
    dimension_headers = {normalize_header(name) for name in dimensions_map.values()}
    metric_headers = {normalize_header(name) for name in metrics_map.values()}
    extras: list[str] = []
    for header in headers:
        key = normalize_header(header)
        if key in dimension_headers or key in metric_headers:
            continue
        if any(mark in key for mark in ("id", "名字", "名称", "名称", "日期", "省", "地区", "词", "类型")):
            continue
        if header and header not in extras:
            extras.append(header)

    normalized_rows: list[dict[str, Any]] = []
    for raw in parsed["raw_rows"]:
        dims: dict[str, Any] = {}
        for key, header in dimensions_map.items():
            value = raw.get(header)
            if key == "date":
                value = parse_date(value)
            elif value is not None:
                value = str(value).strip() or None
            if value is not None:
                dims[key] = value
        metrics: dict[str, float | None] = {}
        for key, header in metrics_map.items():
            metrics[key] = parse_number(raw.get(header))
        custom_metrics: dict[str, float] = {}
        for header in extras:
            number = parse_number(raw.get(header))
            if number is not None:
                custom_metrics[header] = number
        normalized_rows.append({
            "dimensions": dims,
            "metrics": metrics,
            "custom_metrics": custom_metrics,
        })

    dates = sorted(row["dimensions"]["date"] for row in normalized_rows if row["dimensions"].get("date"))
    # Keep declared columns even when every cell is blank; the dashboard should
    # distinguish a blank source field from a field that was never exported.
    available_metrics = sorted(metrics_map)
    available_custom = sorted({
        metric
        for row in normalized_rows
        for metric in row["custom_metrics"]
    })
    missing = [key for key in ("spend", "clicks", "direct_amount") if key not in metrics_map]
    warnings: list[str] = []
    if not dates:
        warnings.append("没有可识别的日期字段或日期值。")
    if missing:
        warnings.append("缺少核心字段：" + "、".join(METRIC_LABELS.get(key, key) for key in missing))
    if report_type == "product" and "product_id" not in dimensions_map:
        warnings.append("没有商品 ID，无法做精确商品关联。")
    if report_type in {"audience", "creative", "region", "unit", "scene"} and "product_id" not in dimensions_map:
        warnings.append("该报表没有商品 ID，只能按报表实际包含的维度分析。")

    return {
        "id": f"{report_type}-{ordinal}",
        "type": report_type,
        "label": TYPE_LABELS[report_type],
        "source_file": parsed["source_name"],
        "member": parsed["member_name"],
        "source_headers": headers,
        "dimensions_available": sorted(dimensions_map),
        "metric_columns": metrics_map,
        "available_metrics": available_metrics,
        "available_custom_metrics": available_custom,
        "custom_metric_meta": {name: _custom_metric_meta(name) for name in available_custom},
        "row_count": len(normalized_rows),
        "date_start": dates[0] if dates else None,
        "date_end": dates[-1] if dates else None,
        "warnings": warnings,
        "rows": normalized_rows,
    }
