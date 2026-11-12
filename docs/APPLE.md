# macOS

[下载 OmiComic 1.1.97](https://github.com/lorcinv/OmiComic/releases/tag/v1.1.97) · [中文操作说明](USER_GUIDE.zh-CN.md) · [English guide](USER_GUIDE.en.md) · [日本語ガイド](USER_GUIDE.ja.md)

## macOS 安装

Apple Silicon（M 系列）选择文件名带 `mac-arm64` 的 DMG 或 ZIP；Intel Mac 选择 `mac-x64`。打开 DMG 后将 OmiComic 拖入“应用程序”；ZIP 解压后同样移动 `OmiComic.app`。两种格式的应用相同。

当前包没有 Apple Developer ID 签名与公证。确认下载来自本仓库的 Release 后，若提示无法验证开发者或未公证，可先尝试打开，再进入“系统设置 → 隐私与安全性 → 仍要打开”。具体提示和操作见 [Apple 官方说明](https://support.apple.com/en-us/102445)。

English: choose `arm64` for Apple Silicon or `x64` for Intel. Drag the app from the DMG into Applications, or extract the ZIP. This release is not Developer ID signed or notarized. For an unidentified-developer or notarization alert after checking the official download source, see [Apple’s first-launch instructions](https://support.apple.com/en-us/102445).

日本語：Apple Silicon は `arm64`、Intel Mac は `x64` を選び、DMG 内または ZIP を展開したアプリを「アプリケーション」に移動します。現在の配布版は Developer ID の署名・公証を行っていません。公式配布元を確認したうえで、開発元や公証に関する初回起動の警告は [Apple の案内](https://support.apple.com/ja-jp/102445)を参照してください。

## Mac 操作

- 本地读取图片目录、ZIP/CBZ、RAR/CBR、7z/CB7、PDF、EPUB 和无 DRM 的 MOBI；对应架构的解压工具随包提供。
- 七档卡片尺寸以默认窗口为基准，窗口变化时适度调整，宽窗口增加列数。
- ⌘＋K 聚焦搜索，⌘＋滚轮调整卡片或阅读缩放，选择模式下 ⌘＋A 全选。
- 使用原生窗口按钮；关闭窗口后从 Dock 重新打开，⌘＋Q 退出应用，Control＋⌘＋F 切换系统全屏。
- 设置 → 关于 OmiComic → 操作说明，可切换 Windows、macOS、Android 分类；内容支持中文、English、日本語，离线可查。

本机编译需要 macOS：运行 `npm ci`，再运行 `npm run dist:mac`。Windows 可通过 GitHub 的 **macOS builds** 工作流构建，两种架构分别执行打包与真实应用测试。

## 更新提醒

关于页底部、操作说明后提供“检查更新”。检查结果和失败重试说明都在按钮内；发现新版后，点击该区域打开官方 Release 页面，自行下载。启动 15 秒后也会检查，同一平台和版本每天最多一次，网络失败不打断阅读。

只查询正式 GitHub Releases，按平台及 Mac 架构匹配安装包，不自动下载或安装。
