# 当前项目状态

**1.0.0 · 2026-10-11**。Windows x64 EXE 与 Android APK 统一使用 1.0.0，下载见 [GitHub 发布页](https://github.com/lorcinv/OmiComic/releases/tag/v1.0.0)。

## 本次完成

- 资源信息与右键菜单新增本地重命名和删除入口；默认仅移除索引，支持恢复索引。
- 本地重命名同步更新阅读进度、收藏、书签、最近阅读、标签及书架引用。写入失败时尝试回滚名称，操作前保存应用数据备份。
- Windows 本地删除移入回收站；失败时保留原文件。Android 通过系统文件提供程序永久删除，弹窗明确说明。
- 保护漫画根目录，禁止重命名覆盖同名文件、改变扩展名或越过授权目录。
- Android 复用 Omi 品牌、首页插画、卡片与四种主题，新增底部导航、两列封面、单击打开、滑动翻页与系统返回。
- Android 原生目录授权与离线读取，支持图片目录、单图、ZIP/CBZ、RAR/CBR、7z/CB7、PDF、EPUB，保存书架、标签、收藏、书签与进度。
- Android 压缩包按页解码，支持固实 RAR5 与 7z、中文自然排序；增加 Omi 自适应及主题图标，沿用发布签名覆盖升级。
- 使用 PDF.js 官方兼容构建适配系统 WebView。没有复制 EhViewer 的 UI 或源码；参考其持久目录授权与进度保存思路。

## 验证

- 类型检查与两端构建通过。
- 浏览器界面 47 项、DOM 16 项通过；服务及算法 62 项通过，1 项历史 7z 用例跳过。
- Windows 实际打包 EXE 与安装后的 EXE 均通过五种格式读取、翻页、续读、重命名、索引恢复、回收站操作及根目录保护检查。
- Windows 安装、快捷方式、系统应用信息、14 种打开方式注册及卸载通过，默认文件关联保持一致。
- Android 使用实际签名 APK 进行系统授权和运行检查，详细结果见 [验证记录](docs/VERIFICATION.md)。

## 当前边界

- Android 8.0+，需要较新的系统 WebView；本轮设备运行环境为 Android 15 模拟器，没有连接实体手机。
- Android 压缩包/文档上限 1 GB、单页图片数据上限 64 MB；原生 RAR/7z 展开总量上限 8 GB。使用受限私有缓存，不向原文件目录解压。
- EPUB 按章节阅读；净化脚本、远程内容、交互及出版方样式，保留文本与位图。
- 不支持密码保护、多卷归档及 DRM。文档封面和预览仍使用格式占位。
- Windows 安装包未做 Authenticode 签名；Android 使用本地持久发布密钥签名。更新 Android 版本必须保留 `.android-signing` 文件夹。

## 构建与复现

Windows：`npm run dist:win`。Android：设置 JDK 与 Android SDK 后运行 `npm run dist:android`，详见 [Android 说明](docs/ANDROID.md)。

功能基线见 [功能与交互](功能以及交互逻辑.md)，使用方式见 [使用方法](README_使用方法.md)。历史发布验证见 [0.2.0 验证](docs/verification-0.2.0.md)。
