# 当前项目状态

**Windows 1.0.3 / Android 1.0.1 · 2026-10-11**。Windows 下载见 [1.0.3 发布页](https://github.com/lorcinv/OmiComic/releases/tag/v1.0.3)，已签名 Android APK 见 [1.0.1 发布页](https://github.com/lorcinv/OmiComic/releases/tag/v1.0.1)。

## Windows 本次完成

- 缩放改用下拉菜单，默认适应窗口；普通模式完整显示超宽图，短图居中。
- 双页只有在窗口能完整容纳时合并，支持窗口变化与尾页续读。
- 全景横向适应高度、纵向适应宽度，普通缩放设置独立保存；长图两端均可到达。
- 清除 Esc 后的按钮描边，刷新按钮统一颜色、大小和对齐。
- 交付 ZIP 免安装版，完整解压后运行，沿用本机记录，包中没有用户数据。

## 已有能力

- 两端支持本地重命名、仅删除索引及恢复；Windows 本地删除进入回收站，Android 明确确认后永久删除。文件操作同步关联记录并保存应用数据备份。
- Android 沿用 Omi 的首页、主题、资源卡片及底部导航，单击打开、触摸翻页、系统返回，支持本地图片、ZIP/CBZ、RAR/CBR、7z/CB7、PDF、EPUB。
- Android 1.0.1 修复图标装饰线，优化直接读取、封面任务与缓存；沿用发布证书覆盖升级。详细结果见 [1.0.1 验证](docs/verification-1.0.1.md)。

## 验证与范围

类型检查、生产构建、核心 69 项及 DOM 16 项通过；相关浏览器回归与实际打包 EXE 的双页、封面、多格式读取及数据持久化通过。完整测试证据与范围见 [验证记录](docs/VERIFICATION.md)。

本轮没有重新构建 APK；手机发布版本保持 1.0.1。Windows 实际程序使用独立测试数据运行，没有覆盖本机既有安装或用户漫画。

## 当前边界

- Android 8.0+，需要较新的系统 WebView；上轮运行测试使用 Android 15 模拟器，没有实体手机测试。
- EPUB 按完整章节阅读，保留文本与位图；不保留出版方完整样式、SVG、远程或交互内容。
- 文档卡片已有 Windows 封面；详情逐页预览仍使用格式图标。不支持密码、多卷归档或 DRM。
- Windows 安装包保持未签名；Android 使用持久发布证书，密钥仅保存在被忽略的 `.android-signing` 目录。

## 构建

Windows 免安装版：`npm run dist:portable`；安装器构建命令仍为 `npm run dist:win`。Android：`npm run dist:android`，依赖与签名说明见 [Android 文档](docs/ANDROID.md)。功能规则见 [功能与交互](功能以及交互逻辑.md)，使用方式见 [使用方法](README_使用方法.md)。
