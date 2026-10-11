# Windows 1.0.2 验证记录

日期：2026-10-11。Windows 1.0.2；本次未重新发布 Android，手机继续使用已签名的 1.0.1 APK。上版验证保存在 [1.0.1 记录](verification-1.0.1.md)。

## 本次交付

- 视图菜单点击外部或按 Esc 关闭；内部下拉选择不误关闭。
- 首尾切书按钮改为三角形，越界翻页后才出现，跟随阅读方向镜像。
- 双页封面从 1+2 开始；从单页 6 切换为 6+7，随后 8+9。横跨页独立，配对起点持久保存。
- 末组包含尾页时，内外页码与进度记为最终页和 100%；续读恢复原来的双页组。
- 合集文件夹索引首个可读子资源封面，并显示“文件夹 · 含 X 项目”。PDF 渲染第一页，EPUB 支持 EPUB 3 封面属性、EPUB 2 元数据及首章图片；无封面时显示格式 SVG 图标。
- 刷新与失效检测移至顶部“选择”右侧。

## 验证结果

| 项目 | 结果 |
| --- | --- |
| 类型检查、生产构建及 Windows NSIS 打包 | 通过，程序实际版本 1.0.2 |
| 核心服务与算法 | 66 项：65 通过，1 项既有 7z 通配符用例跳过 |
| DOM 数据与交互 | 16 项通过 |
| 本地浏览器回归 | 完整回归中 52 项通过；修正两处旧配对/按钮定位断言后，相关 13 项复测通过 |
| 实际打包 EXE 多格式读取 | PNG、CBZ、CB7、PDF、EPUB 打开、翻页、返回、持久化通过 |
| 实际打包 EXE 封面 | 7 个资源封面解码通过，最长边不超过 360 像素；损坏 PDF 和无图 EPUB 显示无文字图标 |
| 文档阅读与封面并发 | 两个封面会话共存；打开正文取消后台封面；后来的封面请求不能中断正文 |
| 实际打包 EXE 双页 | 1+2、末组 9+10、100% 与资源库 10/10、从 6 配对到 6+7/8+9、退出续读与持久化起点均通过 |
| 文件管理回归 | 本地重命名、仅删索引、恢复索引、回收站删除及根目录保护通过 |

运行使用独立临时数据目录及专用测试资源，未改动用户漫画与阅读记录。本轮生成安装器并验证对应的打包程序，没有对本机既有安装执行安装与卸载。

测试入口：`npm test`、`npm run test:dom`、`npm run test:ui`、`node --test tests/packaged.electron.cjs`；封面与双页实际程序测试为 `tests/covers.electron.cjs`，设置 `OMICOMIC_PACKAGED_EXE` 指向打包程序。结果位于本地 `test-results/packaged-smoke.json` 与 `test-results/pc-cover-results.json`，截图为 `pc-real-covers.png`、`pc-real-double-pages.png` 和 `pc-triangle-next-book.png`。

## 发布文件

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| OmiComic-Setup-1.0.2-x64.exe | 100385663 | `a78e65bcb1063bd1f437418adb157faa433a70b272d6b157ec6e71e1536379fe` |
| 7z2604-src.tar.xz | 1560440 | `9691944c0fe0d01bb49373a704fb983fd33bc98b1738695179dfbf99ac1734f6` |

Windows 按用户既有选择保持未签名，安装包 Authenticode 状态已检查。对应 7-Zip 源码随发布附件提供。

下载：[Windows 1.0.2](https://github.com/lorcinv/OmiComic/releases/tag/v1.0.2)；[Android 1.0.1](https://github.com/lorcinv/OmiComic/releases/tag/v1.0.1)。源码线上完整回归见 GitHub 的 Verify reader and library 工作流。

## 免安装 ZIP 补充验证

2026-10-11 增加 Windows x64 ZIP，程序内容与已发布的 1.0.2 安装版一致。`npm run dist:portable` 显式选择 ZIP 目标，随包附上中文使用说明。原有安装器及 v1.0.2 标签保留。

`node --test tests/portable.electron.cjs` 已通过：检查 ZIP 完整性及 37 个归档项，在含中文的临时目录实际解压，并运行该目录中的 EXE。PNG、CBZ、CB7、PDF、EPUB 打开、翻页、返回、进度持久化及既有文件管理回归均通过。测试确认实际运行路径来自本次解压目录，并使用独立临时数据，不接触用户的阅读记录。

ZIP 与内层 ASAR 均未包含用户数据、测试数据目录或签名私钥；ZIP 没有卸载程序。阅读数据继续保存在本机 `%APPDATA%\OmiComic\omicomic-data.json`，不随程序压缩包分发。结果保存在本地 `test-results/portable-smoke.json`。

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| OmiComic-Portable-1.0.2-x64.zip | 140295591 | `5bc4522d5b2fc813cfc5290e5ebb4dbed037ad0e9e1cecb2f0d24760c844cc21` |

免安装 ZIP 作为 v1.0.2 的新增附件提供，同名 `.zip.sha256` 文件用于独立校验。
