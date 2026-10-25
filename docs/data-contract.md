# 数据结构与输入契约

## 输入容器

- ZIP：递归读取压缩包内 CSV/XLSX，不落盘解压；拒绝加密包、超限文件和不支持的格式。
- CSV：尝试 UTF-8 BOM、UTF-8、GB18030 与 UTF-16；按 CSV 引号规则解析。
- XLSX/XLSM：通过 openpyxl 读取工作表首个有效表头及其后的数据行。
- XLS（二进制旧格式）暂不支持；应从平台重新导出 CSV/XLSX。

## 识别字段

同义字段通过表头映射到规范字段，源字段名仍保存在数据集的 source_headers 中。

| 规范字段 | 常见源表头 |
| --- | --- |
| date | 日期、统计日期 |
| product_id | 主体ID、宝贝ID、商品ID |
| product_name | 主体名称、宝贝名称、商品名称 |
| scene_id / scene_name | 场景ID / 场景名字、营销场景ID / 营销场景名称 |
| plan_id / plan_name | 计划ID / 计划名字 |
| unit_id / unit_name | 单元ID / 单元名字 |
| audience_name | 人群名字、人群名称 |
| creative_id / creative_name | 创意ID / 创意名字 |
| keyword_type / keyword_id / keyword_name | 词类型、词ID/词包ID、词名字/词包名字 |
| province | 省、省份、地域 |
| impressions / clicks / spend | 展现量、点击量、花费 |
| direct_amount / total_amount | 直接成交金额、总成交金额 |
| direct_orders / total_orders | 直接成交笔数、总成交笔数 |

导出表头有变化时，页面报告未识别字段并保留源字段，不静默套用近似字段。

## 报表分类

优先使用字段结构识别，文件名仅作为辅助线索。词包/关键词先于商品分类；含主体/宝贝和计划 ID 的数据可识别为商品×计划明细。

## 数据集输出

每个报表作为独立数据集，包含：报表类型、输入文件基名、源表头、行数、日期起止、规范维度、核心指标、可解析的额外数值指标和数据质量警告。项目不保存原始业务数据样例。
