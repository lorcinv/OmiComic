# OmiComic Android 1.1.19 工作报告

日期：2026-10-16。本轮完成手机设置入口、弹层灰度、设置文案、手机版说明和中／英／日界面适配。保持既有漫画读取、预加载与缓存策略。

## 安装包

- [OmiComic-1.1.19-android.apk](../release/OmiComic-1.1.19-android.apk)，14,463,602 字节，约 14.46 MB。
- Android 8.0+；包名 `io.github.lorcinv.omicomic`，versionCode `10119`；包含 arm64-v8a、armeabi-v7a、x86_64、x86。
- 沿用原发布签名，直接覆盖安装可保留记录，不要先卸载。
- SHA-256：`fe18893665d5f230fad3e43abc229571b142816a71f12c976070a58efff6bded`。[校验文件](../release/OmiComic-1.1.19-android.sha256)
- 签名证书 SHA-256：`31d30425848de4b32a69e27873756562f400996ef647cba83443b6b20ad9db43`。

已完成类型检查、前端生产构建、Android SDK 编译、签名、16 KB 对齐与资源检查。最终 APK 已覆盖安装，并取回实际安装文件核对哈希；以下 12 组 Android 运行结果都对应上述安装包。

[安装证据](../test-results/mobile1119-install.json) · [APK 检查](../test-results/mobile1119-apk-verify.json) · [测试汇总](../test-results/mobile1119-summary.json)

## 六项改动

| 请求 | 完成内容 |
| --- | --- |
| 首页直接进入设置 | 首页直接打开独立设置页面，不经过资源库，不播放 Omi 图标展开；退出设置回到首页。 |
| 弹层闪烁与灰度 | 底部面板、左右抽屉、确认弹窗和应用设置共用一层遮罩。首次进入线性变暗；叠加与替换保持灰度；最后一层退出后恢复。保留跟手拖动、反向拖动、取消手势和系统返回。菜单切换到应用设置时，旧菜单在新页面提交时才关闭，避免转场截取亮背景。 |
| 漫画阅读设置 | 手机版移除“当前漫画”下拉选项及说明文字；“滚动速度”改为“全景滚动速度”。保留原页面排序、翻页间隔和速度保存方式，桌面版选择器保留。 |
| 性能与缓存 | 删除说明段落，保留容量控制、已用空间和清理按钮。容量范围、默认值和清理行为保持原样。 |
| 关于 OmiComic | 加入手机版离线目录阅读、支持格式、书架与标签、阅读手势、自动阅读、大图与缓存适配的简要说明。没有加入 Windows 功能。 |
| 中／英／日 | 在“设置 → 外观与主题 → 语言”选择简体中文、English、日本語。立即切换，重启保留。覆盖首页、各栏目、详情、操作菜单、设置、阅读工具及常用错误提示；漫画文件名、路径、书架名、标签、简介和正文保留原文。旧数据默认中文。系统文件选择器仍采用 Android 的系统语言。 |

新增 706 组英／日文案；没有增加运行依赖。语言适配只转换显示文本，存储字段、排序值、按钮动作与文件标识不作翻译。验证了文件名恰好为“设置”时，英文界面仍显示原文件名。

界面截图：[手机版说明](../test-results/mobile1119-about-zh.png) · [英文设置](../test-results/mobile1119-appearance-en.png) · [日文设置](../test-results/mobile1119-appearance-ja.png) · [日文重启恢复](../test-results/mobile1119-ja-restored.png)

## 回归结果

| 范围 | 结果 |
| --- | --- |
| 浏览器界面 | **48/48 通过**：主页入口、菜单替换、确认弹窗叠加、线性遮罩、左右跟手与反向拖动、三语切换、英文主要页面文字检查、系统返回，以及既有手机与桌面阅读布局。 |
| 组件测试 | **76/76 通过，12 个文件**：包括用户文本不被翻译、选项值不被改写、语言默认值及全部翻译占位符完整性。 |
| 阅读布局与预读窗口单元测试 | **6/6 通过**，方向、预算、双页和关闭预读的边界保持可用。 |
| Android 运行检查 | **12/12 通过**：新版界面、语言跨进程恢复、首页点击、独立布局与路径、快速拖条及零预读、格式兼容、超大 PNG 冷／热打开、方向性预读、静止稳定、原生阅读与放大图块。 |

实际 Android 触摸进入“显示选项 → 标签管理”时，连续 58 帧的遮罩采样均为满目标灰度，没有中间归零。浏览器另验证弹出删除确认时背景不加深，取消后仍保留抽屉及同一遮罩，全部退出后恢复。

旧问题已回归：最近阅读首排误触、打开漫画后才更新排序、各栏目独立显示、书架“打开路径”位于底部、路径跳转采用资源库布局、普通展示文字禁止选择而详情文件名可复制、预览静态选中框、快速拖动后预览恢复。

格式组实际验证 17 个目标：图片目录、JPG、JPEG、PNG、WebP、BMP、GIF、Stored ZIP、Deflate CBZ、LZMA ZIP、BZIP2 ZIP、RAR4、RAR5 CBR、7z、固实 CB7、PDF、EPUB；加密、损坏及空包按既有规则返回错误。

[界面记录](../test-results/mobile1119-browser.txt) · [组件记录](../test-results/mobile1119-dom.txt) · [新版 Android 界面](../test-results/mobile1119-ui.json) · [语言恢复](../test-results/mobile1119-ui-restore.json) · [格式记录](../test-results/mobile1119-mobile1116-formats.json)

## 超大 PNG 复查

沿用 1,916,865,148 字节、110 页、3444×5120 PNG 的生成 CBZ 样本，包含五种图像模式。这一轮确认阅读与清理仍可正常运行，没有改动加载方案。

| 条件 | 清晰首屏 | 8 次翻页清晰中位数 | 6 次远跳中正文及可见预览全部恢复的最长时间 |
| --- | ---: | ---: | ---: |
| 冷阅读缓存 | 1202 ms | 408.5 ms | 2247 ms |
| 新进程、保留清晰底图 | 603 ms | 405.5 ms | 1722 ms |

两轮均通过低清补载取消后的恢复、临时读取失败重试、末页跳转、静止无持续解码、缓存预算和退出清理检查。退出后临时页面为 **0 字节**，清晰底图分别保留约 **23.5 MiB／41.3 MiB**，均在 128 MiB 上限内；正文、预览和图块的内存引用清空。整包复制量为 0 字节。

[冷缓存记录](../test-results/mobile1119-png-cold.json) · [跨进程记录](../test-results/mobile1119-png-restore.json) · [预读回归](../test-results/mobile1119-prefetch.json) · [抗摩尔纹与稳定性](../test-results/mobile1119-native-stability.json) · [原生阅读](../test-results/mobile1119-native-reader.json)

测试环境为 Android 15 x86_64 模拟器、WebView 124，未连接实体手机。计时包含 Android 输入与状态检查开销，冷阅读缓存不等于清空操作系统文件缓存；这些数值是本次回归结果，不作为手机速度提升的对照结论。

## 修改范围与复查

本轮开始前保存了源码副本、哈希及 Git 状态于 `.cache/mobile1119-baseline/`，范围按该副本核对。50 个 Android 原生及阅读辅助文件哈希未变；安装包中的 `classes.dex` 与全部原生 `.so` 内容也与 1.1.18 逐项一致。阅读页面只接入显示文案翻译，没有修改读图队列、PNG 解码、相邻页预读、缓存预算或退出释放实现。

1.1.18 APK 保留且哈希未变。Windows 成品保持 1.1.10；本次为本地 Android 交付，未推送或发布到 GitHub。[范围核对](../test-results/mobile1119-scope.json)

复查入口：

```powershell
npm run typecheck
npm run test:dom
npx playwright test tests/mobile1119.spec.ts tests/mobile-transitions.spec.ts tests/mobile-motion.spec.ts
node --test src/reader/preloadWindow.test.cjs src/reader/layout.test.cjs
node scripts/verify-android.cjs
./scripts/test-android.ps1 -Mode mobile1119-ui -ExpectedVersion 1.1.19 -JavaHome <JDK路径>
./scripts/test-android.ps1 -Mode mobile1119-ui -Fixture restore -ExpectedVersion 1.1.19 -JavaHome <JDK路径>
```

Android 运行检查使用既有专用模拟器、测试目录授权与生成样本。构建入口为 `npm run dist:android`，使用项目既有 Android SDK 脚本和原发布密钥。
