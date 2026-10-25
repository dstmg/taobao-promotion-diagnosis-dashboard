# 安装与开始使用

本项目提供 `SKILL.md` 和本地 Python 程序。Agent Skill 负责告诉 AI 如何分析和运行程序；真正读取报表、生成 HTML 的工作由本机 Python 完成。需要 Agent 能读取用户选定的本地文件并运行本地命令。

## 在 Codex 桌面版安装

1. 下载项目的 Skill 压缩包。
2. 选择一种方式安装到 Codex Skills 目录：默认目录是 `%USERPROFILE%\.codex\skills\taobao-promotion-diagnosis-dashboard`；如果设置了 `CODEX_HOME`，则目录为 `%CODEX_HOME%\skills\taobao-promotion-diagnosis-dashboard`。

   手动解压时，把压缩包内的 `taobao-promotion-diagnosis-dashboard` 文件夹放进 Skills 目录。也可以用 PowerShell 自动解压；把 `$zip` 改为下载的 ZIP 完整路径：

   ```powershell
   $zip = "D:\Downloads\taobao-promotion-diagnosis-dashboard.zip"
   $skillsRoot = if ($env:CODEX_HOME) { Join-Path $env:CODEX_HOME "skills" } else { Join-Path $env:USERPROFILE ".codex\skills" }
   New-Item -ItemType Directory -Force -Path $skillsRoot | Out-Null
   Expand-Archive -LiteralPath $zip -DestinationPath $skillsRoot
   ```

   压缩包自带 `taobao-promotion-diagnosis-dashboard` 顶层文件夹，解压后会落在该目录下。

3. 确认该文件夹根目录里有 `SKILL.md`、`requirements.txt` 和 `scripts\build_report.py`。
4. 安装依赖到 Codex 本地运行命令所用的 Python 环境。打开 PowerShell，替换为实际安装目录后运行：

   ```powershell
   python -m pip install -r "$env:USERPROFILE\.codex\skills\taobao-promotion-diagnosis-dashboard\requirements.txt"
   ```

   如果使用了 `CODEX_HOME`，把上面路径中的 `$env:USERPROFILE\.codex` 换成 `$env:CODEX_HOME`。如果 Codex 执行命令时使用另一套 Python，请在那套 Python 中安装依赖。

5. 重新打开 Codex 任务，然后提供报表并说明使用“淘宝推广投产诊断与多维看板”Skill。若新 Skill 尚未出现在可用技能列表中，重新启动 Codex 后再检查。
6. 确认 AI 能访问报表所在的本地目录。可以这样发起任务：“请使用淘宝推广投产诊断与多维看板 Skill，分析 `D:\推广报表` 中的报表，并把生成的 HTML 保存到 `D:\推广报表\投产分析.html`。”

Codex 默认用户级 Skill 目录示例为 `~/.codex/skills/<skill-name>/`。其他 Agent Skills 宿主的发现目录和本地命令能力可能不同；`SKILL.md` 格式相同不代表宿主会自动安装或允许运行脚本。请按宿主文档配置，并确认它允许访问本地文件及运行 Python。

以上是按 Codex 文档整理的安装方式；目前尚未在一套干净的 Codex 配置中实际安装并验收 Skill 自动发现与调用。

## 不通过 AI，手动生成报告

在 Windows PowerShell 中进入项目目录，创建独立 Python 环境、安装依赖，然后运行：

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe scripts\build_report.py --input "D:\推广报表" --output "D:\推广报表\投产分析.html"
```

`--input` 可以是一个 ZIP/CSV/XLSX 文件，也可以是包含多份报表的目录。输出 HTML 会内嵌报表数据，请按源报表同等保管，不要放进公开仓库。

macOS/Linux 的基本运行方式如下，但当前尚未在这些系统完成验证：

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
python scripts/build_report.py --input /path/to/reports --output /path/to/promotion-report.html
```

## 平台和数据边界

- 这是本地 Skill 与命令行程序，不是托管网站、浏览器插件或淘宝账号连接器。
- 不调用淘宝/天猫接口，不上传报表，不操作广告账户。
- 如果报表缺少商品 ID，程序不会把地域、人群等数据猜测关联到具体商品。
- Qwen、Cursor、Claude Code 等其他宿主能否自动识别 Skill、访问本地文件并执行脚本，需要在相应宿主中单独确认；本项目当前只在 Windows + Python 3.12 完成验证。

## 参考

- [Codex Skills 目录示例](https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex)
- [Agent Skills 格式与本地运行说明](https://developers.openai.com/api/docs/guides/tools-skills)
