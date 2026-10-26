# OmiComic 1.1.40 许可证核查

核查范围：Windows 打包脚本及实际 staging notices、Android 固定依赖与许可证目录、仓库内默认素材。项目主许可证为 `GPL-3.0-only`；第三方程序及资源保留各自的授权。

| 内容 | 核查结果 | 交付处理 |
| --- | --- | --- |
| React、React DOM、Scheduler、PDF.js 与 EPUB 解析相关 npm 包 | MIT、BSD、ISC、Apache-2.0 等；未见与 GPLv3 的直接冲突 | Windows 附带第三方 notices 与许可证；补上 npm 包漏附的 `@nodable/entities` MIT 原文 |
| Android libarchive、PNGJ、core-js 与原生压缩组件 | Apache-2.0、BSD、0BSD、zlib 等；Mbed TLS 使用 Apache-2.0 选项 | APK 保留原有组件许可证和 notices，新增项目 GPLv3 全文及源码入口 |
| Windows 7-Zip | 独立调用的未修改可执行文件；其 LGPL、BSD 和 unRAR 限制不能写成 OmiComic 的 GPLv3 授权 | 保留 `7z.exe`、`7z.dll` 的独立 License、readme、源码位置与第三方说明 |
| 原创 Omi 看板娘 `src/assets/home-omi*.webp` | 项目作者自行绘制并提供用于新主页 | 保留作者说明，分层及主题适配过程见[主页素材记录](design/home-art.md) |
| 旧首页默认图 `src/assets/home-scene.webp` | 由用户提供的 `76646330_p0.jpg` 改制；仓库未记录原图作者授权或可再授权依据 | 新版已移除，由作者原创 Omi 替换；[素材来源](../ASSET_CREDITS.md)保留历史记录。旧版二进制发行仍使用该图 |

发布核对：Windows ZIP 根目录与安装目录含 `LICENSE`、`SOURCE_CODE.txt`，NSIS 显示许可页；Android APK 内含 `assets/LICENSE`、`assets/SOURCE_CODE.txt`，以原签名证书构建并与 1.1.38 已发布 APK 的证书摘要比较。两端均完成后才创建同一版本的 Release。

本记录基于仓库中可见的依赖元数据、许可证文本与素材来源说明；不能代替对未知原图权属的证明。
