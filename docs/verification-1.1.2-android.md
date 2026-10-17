# Android 1.1.2 验证记录

日期：2026-10-13。将 Windows 1.1.2 的共享前端同步到 Android，并补齐原生元数据、封面和手机布局。最终 APK 为 `release/OmiComic-1.1.2-android.apk`；versionCode **10102**，包名保持 `io.github.lorcinv.omicomic`。

## 已执行验证

| 项目 | 结果 |
| --- | --- |
| 类型检查及生产构建 | 通过，APK 及应用显示版本均为 1.1.2 |
| 核心测试 | 81 项：80 通过，1 项既有 Windows 星号文件名测试跳过 |
| DOM | 17 项通过 |
| 浏览器回归 | 手机、Android 单击、连续分页、阅读工具共 18 项通过；最后面板返回及工具栏调整后，相关 13 项再次通过 |
| 覆盖升级 | 专用模拟器从已安装的 1.0.1 覆盖到 1.1.2；应用数据及目录清单逐项一致，8 条原有阅读记录保留，持久目录授权可用 |
| 原生页面时间 | 图片目录、真实 ZIP/CBZ 按文件名降序、时间升序和降序产生预期结果；每次排序当前图片及书签定位保持一致 |
| 原生索引升级 | 旧版磁盘索引重建后包含时间字段，新进程可直接复用；旧缓存没有虚构日期 |
| 自动阅读 | 实际 APK 单页自动推进、末尾停止、全景自动滚动、后台事件暂停通过 |
| 画面处理 | 图片与 PDF 的真实 worker 产出可解码预览；EPUB 基础调整有效，锐化与降噪明确禁用 |
| 按本设置与重启 | 时间间隔、排序、伽马等设置及书签持久保存；新进程恢复同一张图片和处理效果，自动播放保持关闭 |
| 封面与集合 | EPUB 声明封面、PDF 首页、子资源封面实际解码通过；合集只统计子目录及独立漫画，图片和文本不计数 |
| 手机交互 | 系统触摸事件操作播放、画面调整、排序、设置及多格式阅读；面板在屏幕内、可滚动；系统返回先关闭面板；工具栏不超过两行的测试高度 |
| 六类资源触控 | 图片目录、CBZ、RAR5、固实 CB7、PDF、EPUB 均通过实际单次系统触摸进入、翻到第二页及保存进度；详情按钮和预览单击通过，未派发模拟双击 |
| RAR/7z 回归 | RAR4、RAR5、7z、固实 CB7 的中文自然排序、跳页 3→1→2、真实图片与封面、重命名和重启续读通过；加密、损坏、空归档拒绝 |
| 流式提供程序 | 后台图片/文档封面不复制源文件；用户打开后只缓存一次 48,595 字节，释放、重开后仍可解码 |
| 连续分页与横竖屏 | 151 项手机测试库：两列每段 60 项，跳转第二段从第 61 项开始；切换横竖屏保留原项目所在行，最后一项可见，无列表高度缺口 |
| 文件内容 | 10 个设备端阅读样例逐个 SHA-256 与原始样例一致 |
| 发布包检查 | v2/v3 签名、4 ABI、64 位 ELF 及包内原生库 16 KB 对齐、原生库与固定依赖字节一致、许可证完整；不含密钥或测试资源 |
| 构建一致性 | APK 内 211 个界面资源逐文件 SHA-256 与 `dist-android` 一致 |

升级前后完整数据对比使用首个 1.1.2 构建；随后沿用同一证书覆盖最终 APK，最终包另行完成阅读工具和重启恢复验证。测试使用隔离样例，不操作用户漫画。

## 环境与范围

Android 15 / API 35 x86_64 专用模拟器，2 CPU、2 GB RAM、1080×1920、系统 WebView 124。浏览器回归使用本机 Edge，文件接口为测试替身；APK 验证使用独立、同签名的 instrumentation 测试包和真实 SAF 文件服务，生产包没有启用调试接口。

本次没有连接实体手机，也没有重建或重新发布 Windows 安装包。Android 包已在本地交付，未上传 GitHub。

后台画面处理仍有 400 万像素 / 长边 8192 像素的预览上限；该限制不是应用总内存上限。部分文件提供程序或归档不提供修改时间，缺失时间排在最后；全部缺失时禁用时间排序。PDF/EPUB 的逐页详情预览仍使用格式图标。

## 交付文件

- `OmiComic-1.1.2-android.apk`：14,299,593 字节。
- SHA-256：`51eb62cc34203f868e1eac9fdc2f79e1632f77766c3666f74b367bc94007d4c3`。
- 校验文件：`release/SHA256SUMS-1.1.2-android.txt`。
- 发布证书 SHA-256：`31d30425848de4b32a69e27873756562f400996ef647cba83443b6b20ad9db43`，与 1.0.1 相同。

## 重现与证据

构建：`npm run dist:android`；静态包检查：`node scripts/verify-android.cjs`；界面回归：`npm run test:ui -- tests/mobile.spec.ts tests/android-interaction.spec.ts tests/library-continuous.spec.ts tests/reader-tools.spec.ts`。设备样例及命令见 [Android 构建与测试](ANDROID.md)。

本地证据：`test-results/android-upgrade-before.json`、`android-upgrade-after.json`、`android-reader-tools.json`、`android-reader-tools-restore.json`、`android-interactions.json`、`android-archives.json`、`android-archive-restore.json`、`android-storage.json`、`android-originals.json`、`android-artifact.json`、`android-reader-tools.png`，以及 `android-update-core.log`、`android-update-dom.log`、`android-update-ui.log`、`android-update-ui-final.log`。
