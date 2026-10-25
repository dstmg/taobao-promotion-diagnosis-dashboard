from __future__ import annotations

import csv
import io
import zipfile
from itertools import chain, islice
from pathlib import Path, PurePosixPath
from typing import Any, Iterable


SUPPORTED_SUFFIXES = {".csv", ".xlsx", ".xlsm"}
MAX_ARCHIVE_FILES = 80
MAX_MEMBER_BYTES = 60 * 1024 * 1024
MAX_ARCHIVE_BYTES = 180 * 1024 * 1024
MAX_ROWS = 300_000
HEADER_HINTS = (
    "日期", "计划", "场景", "展现", "点击", "花费", "成交",
    "宝贝", "主体", "单元", "人群", "创意", "省", "词包", "词名字",
)


class InputError(ValueError):
    """An input file could not be parsed safely."""


def _decode_csv(data: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "gb18030", "utf-16"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise InputError("CSV 编码无法识别，请另存为 UTF-8 或 GB18030。")


def _header_index(rows: list[list[Any]]) -> int:
    best_index = -1
    best_score = -1
    for index, row in enumerate(rows[:30]):
        values = [str(value).strip() for value in row if value is not None and str(value).strip()]
        if len(values) < 4:
            continue
        hint_score = sum(any(hint in value for hint in HEADER_HINTS) for value in values)
        score = hint_score * 10 + len(values)
        if score > best_score:
            best_index, best_score = index, score
    if best_index < 0:
        raise InputError("前 30 行中没有找到可识别的表头。")
    return best_index


def _unique_headers(values: list[Any]) -> list[str]:
    seen: dict[str, int] = {}
    headers: list[str] = []
    for index, value in enumerate(values):
        name = str(value).strip() if value is not None else ""
        name = name or f"未命名列{index + 1}"
        seen[name] = seen.get(name, 0) + 1
        headers.append(name if seen[name] == 1 else f"{name}__{seen[name]}")
    return headers


def _records_from_rows(rows: Iterable[Iterable[Any]]) -> tuple[list[str], list[dict[str, Any]]]:
    iterator = iter(rows)
    preview = [list(row) for row in islice(iterator, 30)]
    header_index = _header_index(preview)
    headers = _unique_headers(preview[header_index])
    records: list[dict[str, Any]] = []
    for values in chain(preview[header_index + 1:], iterator):
        if not any(value is not None and str(value).strip() for value in values):
            continue
        if len(records) >= MAX_ROWS:
            raise InputError(f"单个报表超过 {MAX_ROWS:,} 行上限。")
        record: dict[str, Any] = {}
        for index, header in enumerate(headers):
            record[header] = values[index] if index < len(values) else None
        records.append(record)
    return headers, records


def _read_csv(data: bytes) -> tuple[list[str], list[dict[str, Any]]]:
    text = _decode_csv(data)
    return _records_from_rows(csv.reader(io.StringIO(text, newline="")))


def _read_xlsx(data: bytes) -> list[tuple[str, list[str], list[dict[str, Any]]]]:
    try:
        import openpyxl
    except ImportError as exc:
        raise InputError("读取 XLSX 需要安装 requirements.txt 中的依赖。") from exc
    from openpyxl.xml import DEFUSEDXML
    if not DEFUSEDXML:
        raise InputError("当前 XLSX XML 安全解析保护未启用，请安装 requirements.txt 中的依赖后重试。")

    from datetime import date, datetime

    workbook = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    parsed: list[tuple[str, list[str], list[dict[str, Any]]]] = []
    try:
        for sheet in workbook.worksheets:
            iterator = iter(sheet.iter_rows(values_only=True))
            preview = [list(row) for row in islice(iterator, 30)]
            header_index = _header_index(preview)
            headers = _unique_headers(preview[header_index])
            records: list[dict[str, Any]] = []
            for values in chain(preview[header_index + 1:], iterator):
                if not any(value is not None and str(value).strip() for value in values):
                    continue
                if len(records) >= MAX_ROWS:
                    raise InputError(f"工作表 {sheet.title} 超过 {MAX_ROWS:,} 行上限。")
                record: dict[str, Any] = {}
                for index, header in enumerate(headers):
                    value = values[index] if index < len(values) else None
                    if isinstance(value, (date, datetime)):
                        value = value.isoformat()
                    record[header] = value
                records.append(record)
            if records:
                parsed.append((sheet.title, headers, records))
    finally:
        workbook.close()
    if not parsed:
        raise InputError("XLSX 中没有包含可识别表头和数据的工作表。")
    return parsed


def _parse_member(data: bytes, member_name: str) -> list[tuple[str, list[str], list[dict[str, Any]]]]:
    suffix = Path(member_name).suffix.lower()
    if len(data) > MAX_MEMBER_BYTES:
        raise InputError(f"文件超过 {MAX_MEMBER_BYTES // (1024 * 1024)} MB 上限。")
    if suffix == ".csv":
        headers, rows = _read_csv(data)
        return [(Path(member_name).name, headers, rows)]
    if suffix in {".xlsx", ".xlsm"}:
        return [(sheet, headers, rows) for sheet, headers, rows in _read_xlsx(data)]
    if suffix == ".xls":
        raise InputError("暂不支持旧版 XLS 二进制文件，请重新导出 CSV 或 XLSX。")
    return []


def read_inputs(input_path: str | Path) -> tuple[list[dict[str, Any]], list[str]]:
    """Read local CSV/XLSX files and ZIP members without extracting archives."""
    path = Path(input_path)
    if not path.exists():
        raise InputError(f"输入路径不存在：{path}")
    files = [path] if path.is_file() else sorted(p for p in path.rglob("*") if p.is_file())
    if not files:
        raise InputError("输入目录中没有文件。")

    datasets: list[dict[str, Any]] = []
    warnings: list[str] = []
    seen_hashes: set[str] = set()
    import hashlib

    def append_parsed(source_name: str, member_name: str, data: bytes) -> None:
        digest = hashlib.sha256(data).hexdigest()
        if digest in seen_hashes:
            warnings.append("发现内容完全相同的重复文件，已跳过一份。")
            return
        seen_hashes.add(digest)
        parsed = _parse_member(data, member_name)
        for sheet_name, headers, rows in parsed:
            datasets.append({
                "source_name": Path(source_name).name,
                "member_name": Path(sheet_name).name,
                "classification_name": Path(member_name).name,
                "headers": headers,
                "raw_rows": rows,
            })

    for file_path in files:
        suffix = file_path.suffix.lower()
        if suffix == ".zip":
            try:
                with zipfile.ZipFile(file_path) as archive:
                    members = [item for item in archive.infolist() if not item.is_dir()]
                    if len(members) > MAX_ARCHIVE_FILES:
                        warnings.append(f"{file_path.name} 文件数超过限制，已跳过。")
                        continue
                    total_size = sum(item.file_size for item in members)
                    if total_size > MAX_ARCHIVE_BYTES:
                        warnings.append(f"{file_path.name} 解压后体积超过限制，已跳过。")
                        continue
                    for item in members:
                        name = PurePosixPath(item.filename).name
                        if Path(name).suffix.lower() not in SUPPORTED_SUFFIXES:
                            continue
                        if item.file_size > MAX_MEMBER_BYTES:
                            warnings.append(f"{file_path.name} 内存在超限文件，已跳过该成员。")
                            continue
                        try:
                            append_parsed(file_path.name, name, archive.read(item))
                        except (InputError, RuntimeError, zipfile.BadZipFile) as exc:
                            warnings.append(f"{file_path.name}/{name}：{exc}")
            except (zipfile.BadZipFile, OSError) as exc:
                warnings.append(f"{file_path.name}：无法读取压缩包（{exc.__class__.__name__}）。")
        elif suffix in SUPPORTED_SUFFIXES or suffix == ".xls":
            try:
                if file_path.stat().st_size > MAX_MEMBER_BYTES:
                    warnings.append(f"{file_path.name}：文件超过 {MAX_MEMBER_BYTES // (1024 * 1024)} MB 上限，已跳过。")
                    continue
                append_parsed(file_path.name, file_path.name, file_path.read_bytes())
            except (InputError, OSError) as exc:
                warnings.append(f"{file_path.name}：{exc}")
        else:
            continue

    if not datasets:
        detail = "；".join(warnings[:4])
        raise InputError("没有解析出可用报表。" + (f" {detail}" if detail else ""))
    return datasets, warnings
