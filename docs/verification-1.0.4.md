# Windows 1.0.4 验证记录

日期：2026-10-11。交付 Windows x64 ZIP 免安装版，Android 保持 1.0.1。前版验证保存在 [1.0.3 记录](verification-1.0.3.md)。

## 本次行为

- 适应窗口移除“默认”字样与左右预留边距，完整显示并居中；宽度、高度缩放各自只约束对应方向，原始尺寸保持原图大小。
- 双页按选定缩放方式判断能否完整容纳；全景仍按阅读方向自动适应，不使用普通缩放选择。
- 相邻书籍按钮使用 8px 圆角、半透明磨砂背景和居中小三角，首尾越界翻页后才显示。
- ↑/↓ 切换上/下一本，恢复各自进度；横向、纵向均生效，输入框和下拉操作不触发，长按不会连续跳书。
- 顶部工具提示下移至控件行下方 12px；统一磨砂样式，层级高于窗口按钮，封面操作提示保留侧向避让。

## 验证结果

| 项目 | 结果 |
| --- | --- |
| 类型检查、生产构建与 ZIP 打包 | 通过，实际 EXE 版本 1.0.4 |
| 核心服务与算法 | 71 项：70 通过，1 项既有归档通配符测试跳过 |
| DOM 交互 | 17 项通过 |
| 本地相关界面回归 | 29 项全部通过，覆盖缩放、全景、双页、切书快捷键、输入避让、长按保护及提示框 |
| 实际 ZIP 解压与运行 | 完整性检查通过，36 个归档项；从含中文的临时目录运行同一份 EXE |
| 实际打包程序多格式 | PNG、CBZ、CB7、PDF、EPUB 打开、翻页、返回和进度持久化通过 |
| 实际打包程序布局 | 真实 PNG：窗口模式无左右边距、适应高度允许超宽图滚动、双页配对、全景缩放与持久化通过 |
| 数据隔离 | ZIP 和内层 ASAR 不含用户数据、测试目录或签名私钥；无卸载程序；使用独立临时数据目录 |

测试入口：npm run verify、npx playwright test tests/reader-layout.spec.ts tests/pc-reader-polish.spec.ts tests/tooltip.spec.ts tests/reader-experience.spec.ts、node --test tests/portable.electron.cjs。线上完整回归见 GitHub 的 Verify reader and library 工作流。

本地证据：test-results/portable-smoke.json、reader-layout-smoke.json、window-tooltip-below-controls.png、pc-triangle-next-book.png、packaged-reader-centered.png。

## 发布文件

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| OmiComic-Portable-1.0.4-x64.zip | 140587337 | 892997e65d3b5777ffe016f1b945dbdc72f041cb1a81f971231f0542c7ad175f |
| 7z2604-src.tar.xz | 1560440 | 9691944c0fe0d01bb49373a704fb983fd33bc98b1738695179dfbf99ac1734f6 |

校验文件为 SHA256SUMS-1.0.4.txt。阅读记录保存在本机 %APPDATA%\OmiComic\omicomic-data.json。Windows 程序未签名；没有运行安装器或修改用户漫画与记录。

下载：[Windows 1.0.4 免安装版](https://github.com/lorcinv/OmiComic/releases/tag/v1.0.4)。
