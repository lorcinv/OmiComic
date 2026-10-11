# 1.0.0 验证记录

验证日期：2026-10-11。Windows 11 x64、Node.js 24、Electron 43.7.9；Android 15 / API 35 x86_64 模拟器、WebView 124.0.6367.219。未连接实体手机。

Windows 和 Android 的源码版本、应用信息、安装包、当前文档统一为 **1.0.0**。Android versionCode 为 **10000**，发布密钥与此前版本一致。Android 应用信息直接引用项目版本，避免两端版本遗漏同步。

## 本轮验证

| 检查 | 结果 |
| --- | --- |
| Windows 与 Android 完整构建、类型检查 | 通过 |
| React DOM | 16 项通过，含 Android 数据保存及 EPUB 净化 |
| Windows 实际打包 EXE | 应用版本 1.0.0；图片、CBZ、CB7、PDF、EPUB 读取、翻页和续读通过 |
| Windows 安装后的 EXE | 再次通过上述真实文件读取测试 |
| Windows 本地文件操作 | 重命名、进度迁移、索引隐藏/恢复、回收站删除及根目录保护通过 |
| Windows 安装与卸载 | 系统应用信息为 1.0.0；两处快捷方式、14 种打开方式、默认关联保留及卸载清理通过 |
| Android 升级与版本 | 从 0.3.1 覆盖安装成功，应用元数据与界面 API 均为 1.0.0，保留系统目录授权及原有进度 |
| Android 压缩包 | RAR4/RAR5/7z/CB7 实际解码通过，覆盖固实 RAR5、固实 7z、中文路径和自然排序 |
| Android 跳页及封面 | 逐个归档按 3→1→2 页读取，校验 PNG 尺寸与像素；封面解码通过 |
| Android 实际阅读器 | 四种归档从封面进入阅读、翻至第 2 页并保存；CB7 重命名后继续读取 |
| Android 重启续读 | 四种归档进度保留，重新启动后继续 RAR5 第 2 页 |
| Android 异常文件 | 加密、损坏及空归档返回错误 |
| Android 图标与包内容 | 自适应和单色图标存在，四种 ABI 齐全，原生库与锁定 AAR 一致、16 KB 对齐，第三方许可齐全，无签名私钥和测试脚本 |
| Android 签名 | APK v2 / v3 验证通过；证书沿用此前版本 |

安装测试使用独立目录及生成的文件，不改动用户漫画或已有安装。Windows 安装回归入口同时修复了 Windows PowerShell 5.1 传递内嵌 JavaScript 引号的问题，已在该版本 PowerShell 实际运行通过。

## 交付文件

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| OmiComic-Setup-1.0.0-x64.exe | 100385195 | `586488b985d997fe72be2ba572bf8b04936d0da038b87ae422ce2ed8653fc4a8` |
| OmiComic-1.0.0-android.apk | 14266725 | `0acfb7e83bb0566cb1f0cc5925d1e27e1c1d13c8b76c22be647190f10c2a6686` |
| 7z2604-src.tar.xz | 1560440 | `9691944c0fe0d01bb49373a704fb983fd33bc98b1738695179dfbf99ac1734f6` |

下载入口：[GitHub v1.0.0](https://github.com/lorcinv/OmiComic/releases/tag/v1.0.0)。Windows EXE 按用户要求保持未签名。Android 证书 SHA-256：`31d30425848de4b32a69e27873756562f400996ef647cba83443b6b20ad9db43`。密钥仅保存在被忽略的本地 `.android-signing` 目录，不提交 GitHub。

## 复现与范围

```powershell
npm run dist:win
node --test tests/packaged.electron.cjs
./scripts/test-installer.ps1
npm run dist:android
node scripts/verify-android.cjs
./scripts/test-android.ps1 -Mode archives
./scripts/test-android.ps1 -Mode archive-restore
npm run test:dom
```

GitHub 主分支的工作流另行执行干净 `npm ci`、构建、服务/算法及 DOM 测试和完整浏览器 UI 回归。Android 模拟器及示例准备见 [Android 说明](ANDROID.md)。

本轮没有实体手机、其他 Android 版本、16 KB 页大小系统或私人大型漫画库的运行结果；16 KB 仅验证 ELF 和 APK 对齐。不支持密码或分卷归档。手机单个归档/文档上限 1 GB，单页图片数据上限 64 MB，原生归档展开总量上限 8 GB。

此前完整功能回归及历史交付哈希分别保留在 [0.3.1](verification-0.3.1.md)、[0.3.0](verification-0.3.0.md)、[0.2.0](verification-0.2.0.md)。历史记录保留原版本号，用于追溯。
