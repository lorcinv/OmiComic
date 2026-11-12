# Apple 测试版

本轮适配以 1.1.96 和七档卡片尺寸为基础。GitHub 的 `Apple test builds` 工作流生成 macOS 与 iOS 模拟器测试包，不创建正式 Release。

## macOS

- Apple Silicon 与 Intel 分别提供 DMG 和 ZIP。
- 沿用桌面七档卡片尺寸，窗口变宽时增加列数。
- 原生窗口按钮、应用菜单和 Command 快捷键；退出窗口后可从 Dock 重新打开。
- 压缩包使用随包提供的对应架构 7-Zip，无需额外安装。
- 当前是未公证的测试包；正式分发还需 Apple 开发者签名与公证。

本机编译：`npm ci`，然后 `npm run dist:mac`。构建需要 macOS。

## iOS 模拟器

下载并解压 `OmiComic-1.1.96-ios-simulator.zip`，在 Apple Silicon Mac 的 Xcode 模拟器中安装 `OmiComic.app`。可直接拖入模拟器，或运行 `xcrun simctl install booted /path/to/OmiComic.app`。此包由 GitHub 的 arm64 构建环境生成；Windows 上可查看随包保存的 iPhone/iPad 阅读截图。

- 使用系统“文件”选择器添加目录，授权会随应用数据保存。
- 共用移动端书架、标签、书签、进度及备份界面。
- 本地读取图片、ZIP/CBZ、RAR/CBR、7z/CB7、PDF、EPUB；MOBI 复用现有解析器。
- 适配 iPhone/iPad、安全区域、横竖屏和触摸缩放；音量键翻页保留在 Android。
- 当前只生成模拟器 `.app`，不能安装到实体 iPhone。真机签名与 TestFlight 不在本轮范围内。

本机编译：安装 Xcode 和 XcodeGen，运行 `npm ci`、`npm run build:ios:renderer`、`node scripts/prepare-ios.cjs`、`xcodegen generate --spec ios/project.yml`，打开 `ios/OmiComic.xcodeproj` 选择模拟器。

## 更新提醒

关于页提供“检查更新”。启动 15 秒后静默检查，同一平台和版本每天最多一次；网络失败不打断阅读，手动检查会显示重试提示。

查询 GitHub 正式 Releases，并按安装包类型和 Mac 架构匹配。仅展示版本、更新摘要和官方 Release 页面；不会下载或安装。iOS 模拟器构建不算可在 iPhone 安装的更新。
