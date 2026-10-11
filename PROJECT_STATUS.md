# 当前项目状态

**Windows 1.0.2 / Android 1.0.1 · 2026-10-11**。Windows 下载见 [1.0.2 发布页](https://github.com/lorcinv/OmiComic/releases/tag/v1.0.2)，已签名 Android APK 见 [1.0.1 发布页](https://github.com/lorcinv/OmiComic/releases/tag/v1.0.1)。

## Windows 本次完成

- 补充 ZIP 免安装包，解压运行 `OmiComic.exe`，沿用当前电脑的本地阅读记录；发行包不包含用户数据。
- 视图菜单支持外部点击和 Esc 关闭；刷新及失效检测移到顶部“选择”右侧。
- 首尾跨本按钮使用三角图形，尝试越界翻页后显示；位置随阅读方向换边。
- 双页从进入页配对，开头 1+2，从第 6 页切换为 6+7、8+9；宽跨页独立。保存配对起点以恢复续读。
- 最后一组包含尾页就显示最终页码，阅读器与资源库同步为 100%/读完。
- 合集文件夹使用首个可读子资源封面，类型显示项目数；PDF/EPUB 生成实际封面，缺失封面使用对应格式图标。

## 已有能力

- 两端支持本地重命名、仅删除索引及恢复；Windows 本地删除进入回收站，Android 明确确认后永久删除。文件操作同步关联记录并保存应用数据备份。
- Android 沿用 Omi 的首页、主题、资源卡片及底部导航，单击打开、触摸翻页、系统返回，支持本地图片、ZIP/CBZ、RAR/CBR、7z/CB7、PDF、EPUB。
- Android 1.0.1 修复图标装饰线，优化直接读取、封面任务与缓存；沿用发布证书覆盖升级。详细结果见 [1.0.1 验证](docs/verification-1.0.1.md)。

## 验证与范围

类型检查、生产构建、核心 65 项及 DOM 16 项通过；相关浏览器回归与实际打包 EXE 的双页、封面、多格式读取及数据持久化通过。完整测试证据与范围见 [验证记录](docs/VERIFICATION.md)。

本轮没有重新构建 APK；手机发布版本保持 1.0.1。Windows 实际程序使用独立测试数据运行，没有覆盖本机既有安装或用户漫画。

## 当前边界

- Android 8.0+，需要较新的系统 WebView；上轮运行测试使用 Android 15 模拟器，没有实体手机测试。
- EPUB 按完整章节阅读，保留文本与位图；不保留出版方完整样式、SVG、远程或交互内容。
- 文档卡片已有 Windows 封面；详情逐页预览仍使用格式图标。不支持密码、多卷归档或 DRM。
- Windows 安装包保持未签名；Android 使用持久发布证书，密钥仅保存在被忽略的 `.android-signing` 目录。

## 构建

Windows：`npm run dist:win`。Android：`npm run dist:android`，依赖与签名说明见 [Android 文档](docs/ANDROID.md)。功能规则见 [功能与交互](功能以及交互逻辑.md)，使用方式见 [使用方法](README_使用方法.md)。
