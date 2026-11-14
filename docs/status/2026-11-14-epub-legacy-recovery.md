# EPUB 旧内核连续模式与空白页修复

日期：2026-11-14。本记录描述修复阶段的 1.1.98 本地测试包；后续按用户要求整理为 Android 1.1.99，见 [正式发行记录](2026-11-14-1.1.99-release.md)。以下版本号、哈希与日志均属于此前本地测试包。

## 本地交付

- 工作目录：`D:/Ai Smart Core/AAA.Project/OmiComic`。保留原有累计未提交修改。
- 本地测试包：`release/OmiComic-1.1.98-epub-fix/OmiComic-1.1.98-android.apk`。
- 版本仍为 **1.1.98 / 10198**，使用原发行签名；这是与公开 1.1.98 不同的本地修复包。公开发行附件未替换。
- APK SHA-256：`ccc358494d8487013fefb668920d7b57658f997613c74cd55d3886eed7964aef`。
- 签名证书 SHA-256：`31d30425848de4b32a69e27873756562f400996ef647cba83443b6b20ad9db43`。
- 六个产品文件的修改前内容均与 1.1.98 交付源码一致。增量文件和补丁随本地包保存；未重新构建 Windows、Mac。

## 修复内容

1. 旧 Android 内核的 `readerMotionStyle` 回退会用行内 `transform` 覆盖连续模式的页锚点定位。800×1200 测试视口中，首页因此位于 (400,600)，恢复到后续页时当前页甚至在屏幕之外。现在将手势位移与横向/纵向锚点合并，继续使用拖动、惯性实时更新的原有 CSS 变量。支持独立变换属性的内核和桌面分支保持原有返回值。
2. EPUB 图片服务失败、返回不支持的资源，或纯矢量 SVG 被过滤后，不再将只剩页码或完全无内容的页面视为成功。没有可显示图片及正文时，显示明确的读取失败或格式不支持提示。已有 SVG 包裹本地位图的支持保留；正常图文和有意留白的章节保留原行为。没有新增纯 SVG 图片文件或矢量页的渲染支持。
3. Android EPUB 已读取有效目录后，即使首次章节加载失败，仍保留可定位的章节，进入现有的单页错误、重试及翻页流程。失败的空内容不进入章节缓存，恢复后可重新读取。桌面 EPUB、PDF 与 MOBI 的首次打开错误行为保持不变。
4. 手机错误原因允许换行，避免“不支持”等关键字被省略号截断。

产品修改范围：`src/reader/cssMotion.ts`、`src/hooks/useReaderZoom.ts`、`src/android/epub.ts`、`src/reader/documentSource.ts`、`src/i18n/messages.ts`、`src/styles/mobile.css`。

## 验证

- `npm run typecheck` 通过，覆盖前端及 Electron 类型检查。
- 7 组相关 DOM 文件共 **70 项通过**：EPUB 图片失败、分页/缓存恢复、原生文档路由、EPUB 入场、Android API、缩放惯性及双击。
- `tests/epub-legacy-recovery.playwright.config.ts`：**16 项通过**，使用真实 Chromium 100 和当前 Chromium 156。覆盖普通、横向、纵向及右向左阅读的保存页恢复、25% 缩小、重新放大、跨轴拖动、模式切换、首页对齐，以及错误页跳过和恢复重试。
- 手机错误文案换行调整后，另跑 **4 项错误页检查通过**，检查文字实际滚动尺寸，确认没有被截断。
- 桌面 EPUB 原有打开/翻页及打开失败/取消流程 **2 项浏览器检查通过**。
- Android 前端构建、Java 编译、原签名校验及安装包打开方式检查通过。
- **Android 15 / WebView 124 专用模拟器，真实 APK 6 组通过**：普通、横向、纵向、右向左图片 EPUB 的原生绘制及真实双指缩放；缺图 EPUB 和 SVG 图片 EPUB 的错误提示、真实点击重试、真实点击跳过后正常原生绘制。版本检查通过。
- 对浏览器和模拟器最终截图做了目视检查。验证日志与截图保存在 `release/OmiComic-1.1.98-epub-fix/verification/`。

本轮没有 Android 9 实体设备，也没有另一位白屏反馈者的 EPUB 原件；上述检查分别属于旧浏览器内核测试、浏览器模拟 Android 界面，以及 Android 15 模拟器实包测试。不能将它们称为反馈设备已经验证，也不代表所有白屏成因已覆盖。

## 测试脚本调整记录

- 初次模式切换测试使用了尚未打开的手机阅读设置按钮，改为先点阅读中心、再打开阅读设置；最终两种内核均通过。
- 初次模拟器准备遇到旧测试 APK 无调试权限，重新构建并安装测试 APK 后完成样例准备。
- 首轮原生测试因截图名含大写字母违反测试宿主的文件名限制而结束；统一为小写。
- 后续原生脚本向 `window` 人工派发键盘事件，事件目标与真实输入不同，未完成翻页；改用宿主注入的真实屏幕点击，最终错误页重试及跳过均通过。
- 原始失败日志保留，最终安装包的完整成功记录为 `android-runtime-verified.log` / `android-runtime.json`。生产代码没有为绕过这些脚本问题增加分支。

## 重现入口

```powershell
npm run typecheck
npm run test:dom -- tests/dom.epub-image-failure.test.tsx tests/dom.android.test.tsx tests/dom.document-source.test.tsx tests/dom.epub-entry.test.tsx tests/dom.document-native-surface.test.tsx tests/dom.reader-zoom-inertia.test.tsx tests/dom.reader-double-tap.test.tsx
$env:OMI_TABLET_BROWSER=(Resolve-Path '.cache/tablet1179/browser-old/chrome-win/chrome.exe').Path
npx playwright test --config tests/epub-legacy-recovery.playwright.config.ts
npx playwright test tests/document-reader.spec.ts --grep 'EPUB opens and turns|failed documents and cancellation'
python tests/android/epub-recovery-fixtures.py .cache/epub-fix-20261114/fixtures
```

安装包沿用 `npm run build:android:renderer` 和 `scripts/build-android.ps1`，输出至独立的本地修复目录。先将合成的三个 EPUB 放入专用模拟器测试提供程序的 `files/tablet1179/`，再以 `scripts/test-android.ps1 -Mode quality1155 -Fixture tablet1179-delivery1198-epubRecovery1198 -ExpectedVersion 1.1.98` 运行实包检查。JDK、SDK 沿用现有配置。
