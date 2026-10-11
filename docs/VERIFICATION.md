# Windows 1.0.3 验证记录

日期：2026-10-11。本轮交付 Windows x64 ZIP 免安装版，Android 发布版本保持 1.0.1。前版验证保存在 [1.0.2 记录](verification-1.0.2.md)。

## 本次行为

- 普通缩放合并为下拉菜单，新增适应窗口；适应高度同时考虑宽度，短图居中，原始尺寸保留滚动。
- 双页仅在当前窗口能完整容纳时配对；尺寸变化重新判断，续读保留原页码，避免尾页被提前改写。
- 横向全景适应高度、纵向全景适应宽度，禁用普通缩放选择；退出恢复原设置，清除旧滚动位置。
- 超长全景允许滚动到实际两端；Esc 退出后的按钮描边被清除，Tab 键导航仍有焦点提示。
- 刷新按钮采用同排控件颜色，图标和按钮在水平、垂直方向居中。

## 验证结果

| 项目 | 结果 |
| --- | --- |
| 类型检查、生产构建与 ZIP 打包 | 通过，实际 EXE 版本 1.0.3 |
| 核心服务与算法 | 70 项：69 通过，1 项既有归档通配符用例跳过 |
| DOM 交互 | 16 项通过 |
| 本地界面回归 | 全量 61 项中 59 通过；修复尾页续读及更新主题控件断言后，相关 13 项复测全部通过 |
| 几何与边界 | 超宽/超长、正常双页、宽图拆分、800→1440 窗口变化、横纵全景两端、居中、Esc 和 Tab 均覆盖 |
| 实际 ZIP 解压与运行 | 完整性检查通过，36 个归档项；从含中文的临时解压目录运行同一份 EXE |
| 实际打包程序多格式 | PNG、CBZ、CB7、PDF、EPUB 打开、翻页、返回及持久化通过 |
| 实际打包程序布局 | 600×900、1200×1000、6000×400、400×6000、1200×400 真实 PNG：双页判定、完整显示、居中、全景切换与缩放持久化通过 |
| 数据隔离 | ZIP 和内层 ASAR 不含用户数据、测试目录或签名私钥；无卸载程序；测试使用独立临时数据目录 |

入口：`npm test`、`npm run test:dom`、`npm run test:ui`、`node --test tests/portable.electron.cjs`。ZIP 测试会依次运行 `tests/packaged.electron.cjs` 与 `tests/reader-layout.electron.cjs`。本地结果保存在 `test-results/portable-smoke.json`、`test-results/reader-layout-smoke.json`；真实程序截图为 `test-results/packaged-reader-centered.png`。线上完整回归见 GitHub 的 Verify reader and library 工作流。

## 发布文件

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| OmiComic-Portable-1.0.3-x64.zip | 140588162 | `e5a3f94d1c4f91ced013a44ddf92ee5ea6fefddb0ffe92b7c6b040a01d697fca` |
| 7z2604-src.tar.xz | 1560440 | `9691944c0fe0d01bb49373a704fb983fd33bc98b1738695179dfbf99ac1734f6` |

校验文件为 `SHA256SUMS-1.0.3.txt`。Windows 程序保持未签名，记录继续保存在本机 `%APPDATA%\OmiComic\omicomic-data.json`。本轮没有运行安装器，也没有改动用户漫画或阅读记录。

下载：[Windows 1.0.3 免安装版](https://github.com/lorcinv/OmiComic/releases/tag/v1.0.3)。
