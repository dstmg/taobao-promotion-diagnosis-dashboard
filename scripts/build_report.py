from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from promo_dashboard.ingest import InputError, read_inputs  # noqa: E402
from promo_dashboard.render import build_payload, render_html  # noqa: E402
from promo_dashboard.schema import normalize_dataset  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="将本地淘宝/天猫推广报表生成可筛选的独立 HTML 看板。")
    parser.add_argument("--input", required=True, help="报表文件、ZIP 压缩包或包含报表的目录")
    parser.add_argument("--output", required=True, help="HTML 输出文件路径")
    args = parser.parse_args()
    try:
        parsed, warnings = read_inputs(args.input)
        datasets = [normalize_dataset(item, index + 1) for index, item in enumerate(parsed)]
        html = render_html(build_payload(datasets, warnings))
        output = Path(args.output).expanduser().resolve()
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(html, encoding="utf-8")
    except (InputError, OSError, ValueError) as exc:
        print(f"生成失败：{exc}", file=sys.stderr)
        return 2
    print(f"已生成：{output}")
    print(f"已载入 {len(datasets)} 份报表数据集。")
    if warnings:
        print(f"有 {len(warnings)} 条导入提示；请在报告顶部查看。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
