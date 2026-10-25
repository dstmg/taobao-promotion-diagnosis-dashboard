# 第三方依赖说明

本项目不复制或分发下列依赖的源代码；安装时由 Python 包管理器按锁定版本获取。

| 包 | 锁定版本 | 许可证 | 来源 |
| --- | --- | --- | --- |
| openpyxl | 3.1.5 | MIT | [PyPI 项目页](https://pypi.org/project/openpyxl/3.1.5/) |
| et-xmlfile | 2.0.0 | MIT | [PyPI 项目页](https://pypi.org/project/et-xmlfile/2.0.0/) |
| defusedxml | 0.7.1 | Python Software Foundation License | [PyPI 项目页](https://pypi.org/project/defusedxml/0.7.1/) |

`defusedxml` 随 XLSX 解析依赖安装，用于启用 openpyxl 提供的安全 XML 解析保护。项目在读取 XLSX 时会确认该保护处于启用状态。

最终发布时应重新核对实际解析出的依赖树、包版本和许可证，并保留相应许可证文本或合规声明。

## 项目视觉素材

`assets/promotion-diagnosis-mascot.png` 是为本项目生成的原创吉祥物插画，衣服上的“腿毛哥”为项目所有者提供的昵称。该插画没有使用第三方平台标识或复制现有吉祥物，并随本项目按 MIT 许可证提供。
