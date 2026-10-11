# OmiComic Android

Android 版本复用 Omi 的 React 界面、阅读器和主题；Java 原生层负责系统目录授权、图片与文档读取、文件重命名及删除。借鉴本地 EhViewer 的目录持久授权和独立进度保存思路，没有复制其 UI 或源码。

## 支持范围

- Android 8.0+，使用较新的系统 WebView（建议 123+）。系统文件选择器授权后离线读取，不申请整个存储空间权限，不需要联网。
- 图片目录、单图、ZIP/CBZ、RAR/CBR、7z/CB7、PDF、EPUB。RAR4、RAR5 和固实 7z 均可直接按页阅读，无需手动解压；暂不支持密码及多卷压缩包。
- 手机两列卡片、底部导航、触控翻页、全景拖动、横竖屏、主题、书架、标签、收藏、书签及阅读记录。
- 单个压缩包/文档最多 1 GB；单张图片压缩数据最多 64 MB；最大 1 亿像素，预览在解码前按比例采样。压缩包最多 30,000 个条目。
- RAR/7z 原生解码使用 libarchive-android 1.1.7 / libarchive 3.8.8；展开总量最多 8 GB，最多一个活动解码器、3 份目录索引、24 MB/12 张页缓存。固实包跳页可能需要顺序解码前面的内容，不会在漫画目录生成解压文件。
- Omi 自适应图标适配不同桌面裁切；Android 13+ 支持主题单色图标。APK 包含 arm64-v8a、armeabi-v7a、x86_64 和 x86；64 位原生库与 APK 内未压缩原生库按 16 KB 对齐。
- EPUB 按章节阅读，移除脚本、远程内容、表单、SVG 与出版方样式。保留净化文本和位图。
- 原生消息端口只交给可信的主页面；EPUB 的 iframe 不含脚本权限，不暴露 JavaScript 文件接口。网页所有请求均被限制到本地资源。

## 数据与文件

目录访问采用 Android Storage Access Framework。授权及阅读记录持久保存，退出应用后可续读。权限被系统撤销时需要重新添加目录。

普通删除引用保留原文件。本地重命名会同步更新所有路径相关记录；本地删除必须在弹窗中单独选择，Android 不提供通用回收站，因此永久删除。根目录受到保护。修改文件前保留一份 `before-file-operation.json`，数据写入通过 Android AtomicFile 完成。

单文件选择器只授予该文件访问权，不自动取得父目录权限。要浏览完整图片目录，请从资源库添加目录。卸载会移除应用私有记录与缓存，不移除所选漫画目录。

## 构建

依赖：Node.js 24、JDK 17+、Android platform 35、build-tools 35.0.0。设置 `JAVA_HOME` 和 `ANDROID_SDK_ROOT` 后运行：

```powershell
npm ci
npm run dist:android
```

脚本使用 Android 官方 aapt、d8、zipalign、apksigner 编译和签名，不依赖 Android Studio 或 Gradle。当前仓库下载的 SDK 也可从 `.cache/android-tools` 使用。输出：`release/OmiComic-1.0.0-android.apk`。

`android/dependencies.json` 固定 Maven Central 原生依赖版本和 SHA-256。构建会核验 AAR、原生 ELF 对齐，使用项目 7-Zip 以 ZIP Store 方式加入原生库，再执行 16 KB zipalign 和签名。不会将 Windows 7-Zip 或 RAR 工具打入 APK。

首次构建创建 `.android-signing/omicomic-release.jks` 和本地密码文件。必须备份整个 `.android-signing` 文件夹，以同一签名发布更新；这些文件已被 Git 忽略，不应上传到仓库。APK 包含 React、React DOM、Scheduler、PDF.js、core-js、libarchive 及其依赖、本地字体和解码器的许可证。Windows EXE 使用独立打包流程。

## 验证

手机布局和触控使用 `tests/mobile.spec.ts` 验证；数据原子提交、并发写入、重启恢复、重命名回滚和 EPUB 净化使用 `tests/dom.android.test.tsx` 验证。签名工具验证 APK 的 v2 / v3 签名。

真实 APK 回归通过独立、同签名的 instrumentation 测试 APK，生产包不打开调试接口。在专用模拟器上执行：

```powershell
node tests/android/fixtures.cjs
.cache/android-tools/platform-tools/adb.exe -s emulator-5580 install -r release/OmiComic-1.0.0-android.apk
.cache/android-tools/platform-tools/adb.exe -s emulator-5580 push .cache/android-fixtures/. /sdcard/Download/OmiSmoke/
# 在 Omi 中通过系统选择器授权 Download/OmiSmoke，首次使用选择“添加目录”。
./scripts/test-android.ps1 -Mode smoke
./scripts/test-android.ps1 -Mode restore
./scripts/test-android.ps1 -Mode ui
# 将 tests/fixtures/android-archives 中七个归档推送到同一测试目录后：
./scripts/test-android.ps1 -Mode archives
./scripts/test-android.ps1 -Mode archive-restore
```

测试会重命名或删除专门生成的示例文件，拒绝对非模拟器设备运行。重复执行前应使用新的测试目录或重新准备示例文件。`restore` 启动新应用进程，检查持久授权及首页续读。结果和截图在 `test-results/android-*`；本轮设备结果见 [验证记录](VERIFICATION.md)。
