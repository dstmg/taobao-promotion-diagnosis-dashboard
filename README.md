# 淘宝推广投产诊断与多维看板

<p align="center">
  <img src="assets/promotion-diagnosis-mascot.png" width="360" alt="腿毛哥小猫推广数据分析师">
</p>

一个面向淘宝/天猫推广报表的本地分析 Skill。读取用户上传的 ZIP、CSV 或 XLSX 报表，做字段识别、口径校验、维度汇总和关联检查，再生成可交互的单文件 HTML 看板。

项目使用自有实现和合成样例。当前版本不连接商家账号、不调用平台接口、不上传数据，也不包含真实店铺报表。生成的 HTML 会内嵌本次报告数据，应按原始报表同等保管。

## 能力范围

- 支持商品、计划、营销场景、人群、创意、地域、单元、关键词等报表类型。
- 支持 ZIP 内 CSV/XLSX、单独 CSV，以及安装依赖后读取 XLSX。
- 支持按日期及可用维度过滤；表格列可排序；提供带固定表头的悬浮查看。
- 展示花费、展现、点击、直接/总成交金额与笔数等源指标，并按实际分母计算 CTR、CPC、转化率和 ROI。
- 未识别的数值列可自选显示，并标注简单均值或合计口径。
- 根据报表中真实存在的 ID 建立关联；缺少商品 ID 的维度不推断到具体商品。
- 输出字段覆盖、日期覆盖、重复文件和不可计算指标提示。

## 本地使用

创建 Python 虚拟环境，安装 requirements.txt，然后运行：

    python scripts/build_report.py --input ./my-reports --output ./output/promotion-report.html

input 可指向含多个报表的目录、单个 ZIP/CSV/XLSX。源文件只在本机读取；脚本不会把源报表复制进项目目录。

## Skill 使用

Codex 安装、依赖配置和手动运行步骤见 [安装指南](docs/installation.md)。其他 Agent Skills 宿主需要具备本地文件读取和 Python 命令执行能力。

完整输入要求、字段口径和关联边界见 SKILL.md、docs/data-contract.md 与 docs/metric-logic.md。

开源前复核记录见 [docs/pre-release-audit.md](docs/pre-release-audit.md)。

## 当前状态

这是采用 MIT 许可证的 0.1.0 初始公开版，已公开源代码、文档、合成样例和项目插画。当前已在 Windows + Python 3.12 完成自动化用例和合成报表验证；干净 Codex 配置中的 Skill 自动发现与调用，以及 Python 3.10/3.11 和 macOS/Linux 尚未验证。
