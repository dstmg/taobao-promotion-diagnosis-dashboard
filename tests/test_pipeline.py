from __future__ import annotations

import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from promo_dashboard.analysis import aggregate_rows, diagnose, product_plan_links  # noqa: E402
from promo_dashboard.ingest import InputError, _records_from_rows, read_inputs  # noqa: E402
from promo_dashboard.render import build_payload, render_html  # noqa: E402
from promo_dashboard.schema import normalize_dataset  # noqa: E402


def load_example(name: str) -> dict:
    parsed, warnings = read_inputs(ROOT / "examples" / "synthetic_reports" / name)
    if warnings:
        raise AssertionError(warnings)
    return normalize_dataset(parsed[0])


class PipelineTests(unittest.TestCase):
    def test_row_limit_stops_consuming_a_large_input(self) -> None:
        consumed = 0

        def rows():
            nonlocal consumed
            for index in range(10_000):
                consumed += 1
                if index == 0:
                    yield ["统计日期", "计划ID", "计划名称", "展现量", "点击量", "花费"]
                else:
                    yield ["2026-10-20", str(index), "样例计划", 100, 5, 8.5]

        with patch("promo_dashboard.ingest.MAX_ROWS", 2):
            with self.assertRaisesRegex(InputError, "行上限"):
                _records_from_rows(rows())
        self.assertLess(consumed, 10_000)

    def test_oversized_direct_file_is_skipped_before_reading(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "large.csv"
            path.write_bytes(b"x" * (1024 * 1024 + 1))
            with patch("promo_dashboard.ingest.MAX_MEMBER_BYTES", 1024 * 1024), patch.object(
                Path, "read_bytes", side_effect=AssertionError("oversized file must not be read")
            ):
                with self.assertRaisesRegex(InputError, "超过 1 MB 上限"):
                    read_inputs(path)

    def test_gb18030_zip_and_csv_import(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            archive_path = Path(temp) / "商品报表.zip"
            source = ROOT / "examples" / "synthetic_reports" / "商品报表.csv"
            with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("exports/商品报表.csv", source.read_bytes())
            datasets, warnings = read_inputs(archive_path)
            self.assertEqual(warnings, [])
            self.assertEqual(len(datasets), 1)
            normalized = normalize_dataset(datasets[0])
            self.assertEqual(normalized["type"], "product")
            self.assertEqual(normalized["row_count"], 4)

    def test_zip_members_are_classified_by_member_filename(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            archive_path = Path(temp) / "all-reports.zip"
            with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as archive:
                archive.write(ROOT / "examples" / "synthetic_reports" / "商品报表.csv", "商品报表.csv")
                archive.write(ROOT / "examples" / "synthetic_reports" / "地域报表.csv", "地域报表.csv")
            parsed, _ = read_inputs(archive_path)
            self.assertEqual({normalize_dataset(item)["type"] for item in parsed}, {"product", "region"})

    def test_xlsx_sheet_import(self) -> None:
        import openpyxl

        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "plan.xlsx"
            workbook = openpyxl.Workbook()
            sheet = workbook.active
            sheet.append(["统计日期", "计划ID", "计划名称", "展现量", "点击量", "花费"])
            sheet.append(["2026-10-20", "7001", "样例计划", 100, 5, 8.5])
            workbook.save(path)
            datasets, warnings = read_inputs(path)
            self.assertEqual(warnings, [])
            self.assertEqual(datasets[0]["member_name"], "Sheet")
            normalized = normalize_dataset(datasets[0])
            self.assertEqual(normalized["type"], "plan")
            self.assertEqual(normalized["rows"][0]["metrics"]["spend"], 8.5)
            from openpyxl.xml import DEFUSEDXML
            self.assertTrue(DEFUSEDXML)

    def test_aggregate_ratios_are_recomputed_from_sums(self) -> None:
        dataset = load_example("商品报表.csv")
        rows, totals, _ = aggregate_rows(dataset, group_by=["product_id", "plan_id"])
        target = next(row for row in rows if row["dimensions"]["plan_id"] == "7001" and row["dimensions"]["product_id"] == "900001")
        self.assertEqual(target["metrics"]["spend"], 176.0)
        self.assertEqual(target["metrics"]["direct_amount"], 240.0)
        self.assertAlmostEqual(target["metrics"]["direct_roi"], 240 / 176)
        self.assertAlmostEqual(totals["direct_roi"], 548 / 300)

    def test_product_plan_link_uses_one_report_and_exact_ids(self) -> None:
        product = load_example("商品报表.csv")
        product["rows"][1]["dimensions"]["product_name"] = "示例洁面商品名称变体"
        keyword = load_example("关键词报表.csv")
        region = load_example("地域报表.csv")
        # Parallel product and keyword views must not double the linked spend.
        links = product_plan_links([product, keyword, region])
        item = next(link for link in links if link["product_id"] == "900001" and link["plan_id"] == "7001")
        self.assertEqual(item["metrics"]["spend"], 176.0)
        # Region data has a plan but no product ID; it cannot create product links.
        self.assertEqual(len(links), 3)

    def test_missing_denominator_stays_null_and_render_is_self_contained(self) -> None:
        dataset = load_example("商品报表.csv")
        for row in dataset["rows"]:
            row["metrics"]["spend"] = 0
        rows, _, _ = aggregate_rows(dataset, group_by=["product_id"])
        self.assertTrue(all(row["metrics"]["direct_roi"] is None for row in rows))
        html = render_html(build_payload([dataset], []))
        self.assertIn("悬浮查看", html)
        self.assertIn("report-data", html)
        for section in ("推广诊断与行动", "核心趋势", "增长机会", "推广商品核查", "新品与测款观察", "投产与分配", "推广商品明细", "商品核查清单", "预算情景试算", "多维拆解"):
            self.assertIn(section, html)
        self.assertNotIn("__DASHBOARD_JS__", html)
        self.assertNotIn("__DASHBOARD_CSS__", html)
        self.assertNotIn("https://", html)

    def test_missing_numerator_is_not_treated_as_zero_sales(self) -> None:
        dataset = load_example("商品报表.csv")
        for row in dataset["rows"]:
            row["metrics"].pop("direct_amount", None)
        rows, totals, _ = aggregate_rows(dataset)
        self.assertTrue(all(row["metrics"]["direct_roi"] is None for row in rows))
        messages = [finding["title"] for finding in diagnose(dataset, totals)]
        self.assertNotIn("有花费但无直接成交金额", messages)

    def test_date_filter_excludes_rows_without_dates(self) -> None:
        dataset = load_example("商品报表.csv")
        dataset["rows"][3]["dimensions"].pop("date", None)
        _, totals, _ = aggregate_rows(dataset, filters={"date_start": "2026-10-21"})
        self.assertEqual(totals["clicks"], 48.0)

    def test_custom_average_metrics_are_not_summed(self) -> None:
        dataset = load_example("计划报表.csv")
        rows, _, _ = aggregate_rows(dataset, group_by=["plan_id"])
        metrics = rows[0]["custom_metrics"]
        self.assertEqual(metrics["平均点击花费"], 3.0)
        self.assertEqual(metrics["支付转化率"], 0.1)
        self.assertEqual(metrics["ROI倍数"], 3.0)
        self.assertEqual(metrics["自定义数量"], 10.0)


if __name__ == "__main__":
    unittest.main()
