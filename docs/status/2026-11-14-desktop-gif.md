# 桌面 GIF 与静态画面处理修复

日期：2026-11-14，Asia/Hong_Kong。本地修复及 Windows 测试安装包，未公开发布；版本信息未修改。

用户反馈最新 PC 版在 Win10 上 GIF 不动，随后自行恢复，开发者也未能复现原始情况。没有取得反馈者的原 GIF、画面调整参数及操作记录，不能认定本次查到的缺陷就是该用户的原因，也不能将其归因为 Win10 兼容问题。

在 Windows 11 专业版 10.0.26100 上，以公开 Windows 1.1.98 的 `release/OmiComic-1.1.98/win-unpacked/OmiComic.exe`、隔离配置和合成的双色循环 GIF，确认了以下独立缺陷：

- 默认设置及仅调整亮度时，GIF 正常播放。
- 开启锐化、降噪或两者后，GIF 被静态处理结果覆盖，只显示第一帧。文件夹 GIF 和压缩包内大写 `.GIF` 均可复现。
- 放大后原图重新可见，动画恢复；恢复正常大小、翻页返回和全景阅读时仍会被冻结。

`ReaderImageEffects` 的锐化与降噪将原图交给 `createImageBitmap`，生成单张处理结果。浏览器对动画图片的位图转换使用默认帧或第一帧，见 [HTML 标准](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html)。已有 GIF 排除条件只阻止显示缩放采样，没有阻止这条处理路径。

本次产品改动只涉及 `src/pages/ReaderPage.tsx` 与 `src/components/ReaderSwipePreview.tsx`：GIF 正文及滑页预览不进入静态位图处理。亮度等实时滤镜保留；原有锐化、降噪数值仍保存，切换到静态图片后继续生效。PDF、普通图片的处理条件保持原有行为。没有增加逐帧锐化或降噪。

验证结果：

- `npm run build` 通过，包含类型检查、前端构建和 Electron 编译。
- 实际 Electron 程序检查 3 项通过：`tests/reader-gif.electron.cjs` 的文件夹与压缩包两组，以及 `tests/desktop-images.electron.cjs`。GIF 每组覆盖默认、亮度、锐化、降噪、组合调整、放大、静态图片往返和全景模式共 8 种状态；实际截取窗口像素，确认红、蓝两帧都被呈现。混合书页中的 PNG 仍能完成图像处理。
- DOM 检查 3 个文件、19 项通过：新增 `tests/dom.reader-gif.test.tsx`，并运行 `tests/dom.reader-display-lifecycle.test.tsx`、`tests/dom.reader-entry.test.tsx`。覆盖 GIF 滑页预览的就绪通知、大小写扩展名和亮度滤镜保留。
- 基线 1.1.98 的两组 GIF 用例均捕获了锐化后的停帧；修复后的当前工作区构建通过相同用例。开发构建报告版本 1.1.99，`desktopVersion` 仍为 1.1.98，没有生成新发行版本。

编辑前快照、基线记录和验证日志在 `.cache/reader-gif-20261114/`。基线文件为 `baseline.log`、`baseline-folder.json`、`baseline-archive.json`；修复日志为 `build.log`、`fixed-electron.log`、`dom.log`。截图使用 Electron `capturePage` 并保持测试窗口隐藏；直接通过 Canvas 读取 GIF 无法证明动画在播放。

本轮没有 Win10 实机或 Android 设备验证。反馈者如果再次遇到停帧，可先对同一 GIF 执行“画面调整 → 恢复默认”；若仍然停帧，需要保留原文件及触发步骤继续定位。

## 后续本地安装包

按用户要求，先确认另一对话的 Apple Silicon 和 Intel Mac 包完成构建、运行验证并补发到 1.1.98；依据为 `release/OmiComic-1.1.98/verification/mac/publication-result.json`。Mac 的本地下载和文档收尾继续由该对话处理。本任务随后使用独立目录 `.cache/reader-gif-20261114/worktree`、分支 `codex/desktop-gif-fix-20261114`，在公开 1.1.99 源码 `3a7ce1ea0c60d56ef6a0406414c1b2429edae66d` 上整理相同的两处产品修复。

交付目录为 `release/OmiComic-1.1.98-GIF-test-20261114/`：

- `OmiComic-Setup-1.1.98-GIF-test-x64.exe`：Windows x64 测试安装包，显示版本仍为 1.1.98，没有覆盖原发行附件。SHA-256 为 `27e842e202bbe81526d89b248f385e7b43fa77f5fb254861554955ed36a255db`。
- `OmiComic-1.1.98-GIF-test-source.zip`：对应源码；包内 `SOURCE_CODE.txt` 指向此文件。
- `verification/`：构建、测试、安装器内容校验和构建输入记录。

独立目录的类型检查、构建和 19 项 DOM 检查通过。实际打包程序的 4 项检查通过，包括两组 GIF 的 16 种播放状态、静态图片处理、图片/ZIP/7z/PDF/EPUB 打开翻页、进度保存及索引恢复。`tests/packaged.electron.cjs` 的版本断言调整为读取 `desktopVersion`，兼容 Android 1.1.99、桌面 1.1.98 的既有版本分离。

已解出安装器内的应用载荷，确认 `OmiComic.exe`、`resources/app.asar` 及 EPUB worker 与通过测试的程序 SHA-256 一致。本轮没有将测试包安装到用户正在使用的软件目录，也没有推送或公开发布。

构建复用了现有依赖目录；475 个已安装依赖版本中，两项仅用于开发的间接依赖与锁文件不同（`@hapi/tlds` 1.1.7 / 锁定 1.1.9，`@peculiar/json-schema` 1.1.12 / 锁定 1.1.13），二者均未进入主程序打包内容，记录于 `verification/build-inputs.json`。未修改共享依赖、锁文件或版本号。

重建时执行 `npm run package:prepare`，将生成目录 `.packaged-app/SOURCE_CODE.txt` 改为对应本地测试源码 ZIP 的说明，再执行 `npx electron-builder --win nsis --x64 --publish never`，将输出目录指定到独立交付目录，`win.artifactName` 指定为上述测试安装包名。将 `OMICOMIC_PACKAGED_EXE` 指向生成的 `win-unpacked/OmiComic.exe`，运行 `node --test --test-concurrency=1 tests/reader-gif.electron.cjs tests/desktop-images.electron.cjs tests/packaged.electron.cjs`。
