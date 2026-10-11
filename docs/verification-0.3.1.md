# Android 0.3.1 验证记录

验证日期：2026-10-11。Windows 11 构建，Android 15 / API 35 x86_64 模拟器、系统 WebView 124.0.6367.219 运行。没有连接实体手机。本轮交付 Android 0.3.1；Windows 继续使用已验证的 0.3.0 EXE。

历史完整回归保留在 [0.3.0 验证](verification-0.3.0.md) 和 [0.2.0 验证](verification-0.2.0.md)。当前改动未推送远端，也未发布 GitHub Release。

## 本轮结果

| 检查 | 结果 |
| --- | --- |
| 类型检查、Android 完整构建 | 通过 |
| React DOM | 16 项通过，包括 Android 数据保存与 EPUB 净化 |
| 从 0.3.0 覆盖升级 | 实际安装成功，保留系统目录授权及图片、PDF、EPUB 三种阅读记录，图片从第 2 页续读 |
| RAR4 / RAR5 / 7z / CB7 | 四个真实归档均解码成功，包含固实 RAR5 与固实 7z |
| 中文目录与自然排序 | `漫画/页1.png`、`页2.png`、`页10.png` 顺序正确 |
| 跳页与封面 | 按 3→1→2 的顺序读取，逐页校验实际 PNG 尺寸与像素颜色，缩略图解码成功 |
| Omi 阅读界面 | 四种新增归档均从封面进入阅读器、显示第 1 页、翻至第 2 页并保存 |
| 进程重启 | 四个归档进度恢复，RAR5/CBR 在实际阅读器继续第 2 页 |
| 重命名 | CB7 本地重命名后保留进度，可重新读取；再恢复原名 |
| 异常归档 | 密码归档、损坏文件、无图片归档返回错误；加密提示为中文 |
| 原有手机交互 | 两列卡片、实际重命名弹窗、Android 永久删除确认、设置界面边界通过 |
| 图标 | PackageManager 加载为 AdaptiveIconDrawable，单色层存在；已导出实际图标并目视检查 |
| APK 签名 | v2 / v3 验证通过，证书与 0.3.0 一致 |
| 原生库 | 四种 ABI 齐全，与锁定 Maven AAR 字节一致；64 位 ELF 和 APK 未压缩原生库 16 KB 对齐 |
| 包内容 | 第三方许可齐全；没有签名私钥、密码或测试脚本；不申请网络或存储权限 |

实际 APK 使用 libarchive-android 1.1.7，运行时报告 libarchive 3.8.8。原生依赖 SHA-256 固定在 `android/dependencies.json`。APK 内原生库使用 ZIP Store，再进行 16 KB 对齐；仅源码编译成功不能代替安装检查。

## 交付文件

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| OmiComic-0.3.1-android.apk | 14266725 | `ce42911f77dd32867b02ae115fe7beb5e094a0866298dea8fc2afe204c419b3a` |
| OmiComic-Setup-0.3.0-x64.exe | 100385218 | `b7c72baaa1eef7e611005e794587980b08a24f8094cd7306595f141b00885649` |

Android 发布证书 SHA-256：`31d30425848de4b32a69e27873756562f400996ef647cba83443b6b20ad9db43`。版本号 0.3.1，versionCode 301，最低 Android 8.0。可以直接覆盖安装 0.3.0，不应先卸载。Windows EXE 按用户要求保持未签名。

## 验证边界

本轮没有实体手机、其他 Android 版本、16 KB 页大小系统或大体积私人漫画库运行结果。16 KB 兼容性在本轮仅验证原生 ELF 和 APK 对齐。RAR/7z 新增读取不支持密码和分卷；单个归档上限 1 GB、单页图片数据上限 64 MB、展开总量上限 8 GB、条目上限 30,000。固实归档跳页可能需要顺序解码前面的条目。

测试只操作生成的专用示例文件。未重复执行 Windows 全量回归，因为本轮没有修改 Windows 功能或重打 Windows EXE；旧安装包哈希重新核对一致。

## 复现入口

```powershell
npm run dist:android
npm run test:dom
node scripts/verify-android.cjs
./scripts/test-android.ps1 -Mode archives
./scripts/test-android.ps1 -Mode archive-restore
./scripts/test-android.ps1 -Mode ui
```

模拟器、授权和示例准备见 [Android 说明](ANDROID.md)。原有 smoke/restore 示例先运行，再加入 `tests/fixtures/android-archives` 中七个归档。升级检查使用保留 0.3.0 数据的模拟器直接安装新版。

结果位于 `test-results/android-artifact.json`、`android-restore.json`、`android-archives.json`、`android-archive-restore.json`、`android-ui.json`；实际图标 `android-icon.png` 与界面截图在同目录。
