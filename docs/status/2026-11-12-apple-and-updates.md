# Apple 测试版与更新提醒

基于 1.1.96 和用户已确认的 PC 七档卡片尺寸改动。

- macOS：桌面阅读器、原生窗口菜单、Command 快捷键、Apple Silicon / Intel 打包。
- iOS：共用移动界面，系统目录授权、图片/压缩包/文档读取、iPhone/iPad 布局；先交付模拟器测试版。
- 更新：关于页手动检查，启动后每天最多一次静默检查；按平台安装包判断，只提示和跳转下载。
- 验证环境：本地 Windows；Apple 编译和模拟器运行使用 GitHub macOS runner。用户没有 Mac，未要求签名或上架。

本轮已完成测试版实现。源码保存在 `codex/apple-test-20261112`，验证提交为 `206d413d838fa3bb60394a04c2304f15875e142a`。原工作目录保留既有未提交改动，测试分支以 1.1.96 已发布源码为基线，仅同步本次及已认可的七档缩放变更。

## 验证结果

[GitHub Apple 构建与测试](https://github.com/lorcinv/OmiComic/actions/runs/43176578471) 三项任务全部成功。

- macOS arm64 / x64：实际启动打包后的应用，读取 RAR4、RAR5、7z、固实 7z 和 PDF；检查原生菜单、Command 搜索、Command＋滚轮缩放与关闭窗口后重新打开。两个窗口宽度下的七档尺寸共 14 组测量通过。
- iOS 18.5：在 iPhone 16 Pro 和 iPad Pro 11-inch (M4) 模拟器中运行原生与 WKWebView 测试。目录授权恢复、中文压缩包文件名、CBZ/RAR/7z、PDF、EPUB、MOBI、翻页及阅读进度保存均通过，保留 8 张原始阅读截图。
- Windows：实际打包应用中的新版本提示、官方版本页面地址和联网失败提示通过检查。
- Android：模拟器实际访问 GitHub Releases 接口返回 HTTP 200；手动检查失败后重试成功，版本链接产生正确的系统浏览器打开请求。最终 APK 保留原有签名。
- 本地类型检查、渲染构建通过；七档卡片与详情预览的 11 项界面测试通过。更新与缩放的 10 项 DOM 测试通过，移动端双击及文档相关既有检查也已通过。

更新提示的截图使用模拟的新版本数据，不代表已发布这些版本。

## 交付与范围

测试包和截图位于 `release/testing/apple-updates-20261112/`，使用方法见同目录的 `使用说明.txt` 及 [Apple 说明](../APPLE.md)。

macOS 提供两个架构的 DMG / ZIP，当前未做开发者签名与公证。iOS 提供 arm64 模拟器 `.app` 压缩包，不能安装到实体 iPhone；本轮没有进行 Apple 真机测试、TestFlight 或商店发布。Windows / Android 保持 1.1.96 测试版本，本次未创建正式 Release。
