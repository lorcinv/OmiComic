# 0.3.0 验证记录

验证日期：2026-10-11。Windows 11 x64、Node.js 24、Electron 43.7.9；浏览器测试使用系统 Edge。Android 使用 Android 15 / API 35 x86_64 模拟器，系统 WebView 124.0.6367.219。没有连接实体手机。

本版本为本地交付，未推送仓库或发布 GitHub Release。历史验证单独保留在 [0.2.0 记录](verification-0.2.0.md)。

## 构建与回归

| 检查 | 结果与范围 |
| --- | --- |
| 类型检查、Windows 与 Android 构建 | 通过 |
| 浏览器 UI | 47 项通过：桌面布局、详情、主题、转场、阅读器，以及手机两列卡片、单击打开、滑动翻页和文件操作弹窗 |
| React DOM | 16 项通过，含 Android 并发保存、重启恢复、重命名回滚、EPUB 净化 |
| 服务及算法 | 63 项：62 通过、0 失败、1 历史 7z 用例跳过 |
| Windows 实际 EXE | 图片、CBZ、CB7、PDF、EPUB 打开、翻页、进度保存与恢复通过 |
| Windows 实际文件操作 | 重命名及进度迁移、仅移除索引、恢复索引、真实 Windows 回收站删除、根目录保护通过 |
| Windows 安装器 | 安装、应用信息、两处快捷方式、14 种打开方式、默认关联保留及卸载通过；安装后 EXE 同样通过运行测试 |
| Android 实际 APK | 系统选择器持久授权；图片目录、CBZ、PDF、EPUB 解码/渲染、翻至第 2 页/章并保存通过 |
| Android 实际文件操作 | 重命名迁移进度与收藏、索引隐藏/恢复、永久删除专用示例文件、根目录保护通过 |
| Android 重启 | 独立新进程恢复目录授权、3 种资源的进度，并从首页继续图片漫画第 2 页通过 |
| Android 实际界面 | 两列封面、详情重命名弹窗实际修改文件、永久删除提示、默认索引选项及设置窗口边界通过 |
| Android EPUB 隔离 | 带普通 XML 转义的书目可读；DTD/外部实体书目被拒绝，章节脚本不执行 |
| Android 签名 | apksigner 验证 v2 / v3 签名通过，生产包未开启调试 |

Windows 不具备创建文件符号链接权限，因此目录压力测试使用目录 junction 验证越界路径；两项仅涉及文件 symlink 的检查未在此环境执行，输出中明确记录。历史 7z 字面通配符用例继续跳过，未计为通过。

UI 回归使用模拟文件桥接；Windows EXE 与 Android instrumentation 另行读取真实示例文件、运行实际原生层并验证保存。所有修改和删除均针对生成的测试文件，不涉及用户漫画。

## Android 运行修复

实际安装测试发现并修复了两处仅源码构建无法发现的问题：

- 系统 WebView 124 缺少新版 PDF.js 使用的接口。Android 构建改用 PDF.js 官方 legacy 主模块和 worker，PDF 实际渲染与翻页通过。
- Android 内置 XML 实现不支持桌面 Xerces 的解析开关。原生 EPUB 书目改用禁用 DTD 的 XML Pull Parser，并显式拒绝文档类型和未定义实体。实际章节渲染与脚本隔离通过。

Android 使用保留 Omi 界面的本地 WebView 与 Java 文件桥接；不要求电脑服务在线，不申请全盘存储或网络权限。RAR/CBR、7z/CB7 暂不支持；Android 8–14、16、不同厂商文件提供程序、实体手机与大体积私人漫画库未在本轮验证。

## 交付文件

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| OmiComic-Setup-0.3.0-x64.exe | 100385218 | `b7c72baaa1eef7e611005e794587980b08a24f8094cd7306595f141b00885649` |
| OmiComic-0.3.0-android.apk | 4528841 | `bc002ee7c0ef19b358bf25750174c206cf9f4b9dd4be2df7d2011ca885666dd9` |

Windows Authenticode 状态为 NotSigned。Android 证书 SHA-256 为 `31d30425848de4b32a69e27873756562f400996ef647cba83443b6b20ad9db43`；密钥保存在被忽略的本地 `.android-signing` 目录，后续更新沿用此密钥。

## 复现入口

```powershell
npm run typecheck
npm test
npm run test:dom
npm run test:ui
npm run dist:win
node --test tests/packaged.electron.cjs
./scripts/test-installer.ps1
npm run dist:android
./scripts/test-android.ps1 -Mode smoke
./scripts/test-android.ps1 -Mode restore
./scripts/test-android.ps1 -Mode ui
```

Android 模拟器及示例授权准备见 [Android 说明](ANDROID.md)。测试输出为 `test-results/packaged-smoke.json`、`installer-smoke.json`、`android-smoke.json`、`android-restore.json` 及对应截图。安装器回归拒绝覆盖已有同名安装和快捷方式。原始样本与结果不提交到仓库。
