# 大图读取优化协同交接报告

日期：2026-10-31，Asia/Hong_Kong。状态：第一轮代码修改与针对性验证已完成，按用户后续要求统一升级为 **1.1.56**，Windows 安装包和 Android APK 已在独立目录生成；实际问题漫画与手机真机验证待补。

## 当前结论

Omi 两端都存在可以明确移除的额外处理：Android 对缩小的 PNG 执行逐行解码和自定义滤波，特殊 PNG 还可能分条重复读取；Windows 在原图解码后继续生成 ImageBitmap 和显示缩图，缩图未完成时会隐藏原图。大图增加了这些步骤的时间和内存压力。

本轮增加按单张图片判断的快速路线，满足任一条件即分流：编码数据至少 5 MiB（5,242,880 字节）、超过 16,000,000 像素、长边超过 8192 像素。这里的字节数是图片本身的大小；压缩包按所读页面条目计算。

Android 快速路线继续使用系统 `inSampleSize` 控制解码尺寸，并保留放大时的局部分块。Windows 快速路线由 Chromium 显示原图，跳过额外的显示重采样和等待。普通图片继续使用原来的高质量抗锯齿路线。

**本轮证明了上述瓶颈的改善，尚不能认定用户反馈的全部大文件 bug 已消失。** 用户已确认两端都有问题，但尚未提供稳定复现文件和具体故障现象。

## 工作区与协作边界

- 仓库：`D:\Ai Smart Core\AAA.Project\OmiComic`。
- 分支：`codex/omi-home-guide`。
- 基线 HEAD：`44b6f32394fcd85df90f1ff8193c15bb8fab0019`。
- 应用、桌面版本、锁文件和 Android 清单已统一更新为 `1.1.56`，Android versionCode 为 `10156`；本轮没有创建提交、推送或上传 GitHub。
- 当前交付目录为 `release/OmiComic-1.1.56-本地版/`，旧版正式包保留原位；4 个旧版正式文件的长度及 SHA-256 已逐项核对未变，证据为 `output/large-image-20261031/official-1.1.55-preserved.json`。
- 开始时已有未跟踪的 `docs/status/2026-10-28-*`、`2026-10-29-*` 与 `output/`。这些内容保留原样，不能把整个工作区都视为本轮改动。
- 原始状态与修改前源码保存在 `output/large-image-20261031/before-status.txt`、`android-before/`、`desktop-before/`。
- 稳定接管入口：`docs/COORDINATION.md`。接手后先核对实时 `git status` 和差异，再声明自己负责的文件；不要 reset、清理或覆盖另一账户的新改动。

## 修改文件

下表以仓库根目录为起点。

| 文件 | 修改与目的 |
| --- | --- |
| `android/src/io/github/lorcinv/omicomic/ReaderBitmapDecoder.java` | 新增大图分流；大 PNG 使用系统采样解码；普通图保留 PNGJ/自定义滤波；取消或失败后释放尚未交付的 Bitmap |
| `android/src/io/github/lorcinv/omicomic/NativeReaderSurface.java` | 主图传入已探测尺寸；大图分块跳过自定义预滤波；新增 `nativeBitmapDecodes`、`nativeTileDecodes` 诊断计数 |
| `android/src/io/github/lorcinv/omicomic/LocalLibrary.java` | 派生图缓存改用 `adaptive-raster-v4` / `adaptive-raster-info-v3`，避免与旧策略混用 |
| `electron/services/desktopImageService.ts` | 返回单张图片的 `encodedBytes`；压缩条目使用条目数据大小 |
| `electron/preload.ts`、`src/types/index.ts` | 增加可选的图片编码字节数字段 |
| `src/pages/ReaderPage.tsx`、`src/components/ReaderImageEffects.tsx` | 把编码字节数传到显示路线判断 |
| `src/reader/largeImagePolicy.ts` | 集中定义 Windows 分流阈值 |
| `src/hooks/useReaderDisplaySampling.ts` | 大图直接展示原图，不进入 pending 画布；尺寸未知时在浏览器取得尺寸后再次判断 |
| `src/reader/displaySampling.worker.ts` | 额外检查 Blob 大小和输入尺寸，未知元数据时也能回退 |
| `tests/android/LargeImageChecks.java`、`tests/android/large-image-fixtures.cjs` | 生成并测试大文件、高压缩大图、超长图、透明 PNG；检查采样内存、原生像素、分块与取消 |
| `tests/android/SmokeTest.java`、`scripts/test-android.ps1` | 接入 `large-images` 模式 |
| `tests/large-images.electron.cjs` | 实际 Electron 大图显示与压缩包条目大小验证 |
| `tests/desktop-images.electron.cjs` | 补充编码字节数检查 |
| `tests/dom.reader-display-lifecycle.test.tsx`、`tests/reader-halftone.spec.ts` | 覆盖大图分流和普通图抗锯齿保留 |
| `package.json`、`package-lock.json`、`android/AndroidManifest.xml` | 版本统一为 1.1.56；新旧构建分目录交付 |
| `CHANGELOG.md`、`docs/releases/v1.1.56.md` | 新增本轮更新说明 |

## 验证结果

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| TypeScript 类型检查 | 通过 | `output/large-image-20261031/typecheck.log` |
| 核心测试 | 113 通过，1 跳过，0 失败 | `core-tests.log` |
| 全部界面逻辑测试 | 25 文件、171 项通过 | `dom-tests.log` |
| 阅读显示专项 | 5 项通过：普通图两种尺寸、80 MP 普通/全景、80 MP 空闲/切换、无 WebGL 软件滤波 | `desktop-halftone.log` |
| Electron 实际运行 | 原有桌面图像检查和新大图检查通过 | `desktop-electron.log`、`desktop-runtime.json`、`desktop-images-smoke.json` |
| Android 构建、签名检查 | 通过 | `android-renderer-build.log`、`android-build.log` |
| Android 15 模拟器运行 | 4 类大图、6 个阈值检查、非法图片拒绝、13 组普通图片质量检查通过 | `android-large-images.json`、`android-large-images.log` |
| 差异格式检查 | 通过 | `git diff --check` |

升级至 1.1.56 后重新构建了两端包。Windows 从 NSIS 安装包中提取实际运行文件，核对 EXE、ASAR 与 7-Zip 文件和构建输出逐字节一致，并运行了 3 项打包程序检查：图片授权/缓存/画面调整，大图原生显示，以及 PNG/ZIP/7z/PDF/EPUB 打开和进度保存，全部通过。安装程序、主程序和应用内部均核对为 1.1.56。电脑已有 OmiComic 安装及快捷方式，本轮没有覆盖现有安装，没有执行会改写其注册信息的全新安装/卸载检查。证据为 `windows-1.1.56-runtime.log`、`desktop-1.1.56-runtime.json`、`packaged-1.1.56-smoke.json`。

Android 1.1.56 已安装到专用 Android 15 模拟器，实测 versionName=1.1.56 / versionCode=10156，再次通过 4 类大图、6 个边界检查和 13 组普通图片画质检查。证据为 `android-1.1.56-runtime.json` 与 `android-1.1.56-runtime.log`。上表核心、DOM 和浏览器专项为同一功能代码在版本号递增前的结果；递增后的最终包以本段运行检查为准。

除单独给出的文件外，上表证据均位于 `output/large-image-20261031/`。原始 Android JSON 同时位于 `test-results/android-large-images.json`。

Android 1.1.56 最后一次运行在同一进程对相同图片比较新路线与未改变的旧 PNGJ 路线，统一 `sample=8`：

| 样本 | 原图尺寸 | 编码大小 | 旧路线 | 新路线 | 解码 Bitmap |
| --- | --- | --- | --- | --- | --- |
| 大文件 RGB | 1500×1500 | 6,763,528 B | 107 ms | 3 ms | 139,876 B |
| 高压缩大图 | 4096×4096 | 91,992 B | 179 ms | 5 ms | 1,048,576 B |
| 超长图 | 257×16384 | 20,622 B | 54 ms | 1 ms | 262,144 B |
| 透明 PNG | 1200×1200 | 5,771,447 B | 45 ms | 2 ms | 90,000 B |

这些是合成图片在模拟器上的解码耗时，不包含文件打开、解压、界面布局与首帧显示，也不代表手机真机速度。测试验证了输出与系统原生采样的像素及透明度一致；普通 PNG/JPEG、调色板、透明、ICC、Adam7 的既有质量检查通过。

Windows 实际运行覆盖了 6000×4000 且不足 5 MiB 的图片、1400×1400 且超过 5 MiB 的图片、400×9000 长图。三者均能显示，显示重采样 Worker 启动数为 0，额外显示画布保持 0×0。一个超过 6 MiB 的压缩包内，小页面返回的编码大小为 4024 B，没有把整包大小用于分流。`desktop-runtime.json` 记录打开等待，但没有对应旧版基线，不能据此宣称 Windows 提速倍数。

## ComicScreen 的实现依据

详见 [ComicScreen 大图静态分析](2026-10-31-comicscreen-large-image-analysis.md)。复用本地解包树前，已核对用户 APK 与缓存 APK 的 SHA-256 相同：`a565e7469804864e342a52188327994237c04952e548fb55d80038ed6cfa5baa`。

普通图片先探测宽高，再通过系统解码器采样；超过设备绘制边长时使用缩小底图和视口分块。`A3/b.java` 使用 `BitmapRegionDecoder`、后台任务、过期待办清理及按实际 Bitmap 内存计量的分块 LRU。普通 PNG/JPEG 没有统一交给 OpenCV，也没有在已核查路径中发现“超过 5 MB 就强制全尺寸解码”的方案。

主要位置：`.cache/comicscreen-audit/decoded/sources/com/viewer/comicscreen/ImgActivity.java:6709,7700`、`A3/b.java:285,538,551,578,623`、`p087j3/a.java:146,160`。REA Android 组件缺少 `REA_JADX_MCP_JAR`，本轮没有安装或配置；这些结论来自本地 JADX 静态代码，没有运行 ComicScreen 或测量它的速度。

原理参考：[Android 大图加载](https://developer.android.com/topic/performance/graphics/load-bitmap)、[BitmapRegionDecoder](https://developer.android.com/reference/android/graphics/BitmapRegionDecoder)。本轮实现没有复制第三方反编译代码。

## 测试包与迁移

当前只交付 `release/OmiComic-1.1.56-本地版/` 下明确标注 1.1.56 的文件：

- Windows：`OmiComic-Setup-1.1.56-x64.exe`。
- Android：`OmiComic-1.1.56-android.apk`，SHA-256 为 `448b5e0159394a2c47d574314b01ebd7c5006683e2911c8c791e8413e6ace039`。
- 对应源码：`OmiComic-Source-1.1.56.zip`；源码完整基线加本轮修改，不包含本机缓存与密钥。
- 协作迁移：`OmiComic-1.1.56-large-image-handoff.zip`，包含本轮文件、补丁和验证记录。
- 文件校验：`SHA256SUMS-1.1.56.txt`。

早期尚未升版时生成的 1.1.55 测试包和旧交接包已归档到 `output/large-image-20261031/superseded-1.1.55-preview/`，不再作为当前交付。该目录与正式旧版 `release/OmiComic-1.1.55-本地版/` 分开；本轮没有替换旧正式包。Android 安装与运行验证只针对专用模拟器 `emulator-5680`，未安装到用户手机。

`output/large-image-20261031/omi-1.1.56-large-image-handoff.patch` 只包含本轮列出的源码、测试和交接文档。完整文件清单和摘要见 `handoff-1.1.56-manifest.json`。迁移包不包含第三方解包源码、签名密钥、用户配置或漫画文件。

同一工作目录换账户时直接读当前差异，不要再次应用补丁。在另一份干净的仓库接管时，先确认基线及已有修改，再执行 `git apply --check`；检查通过后才应用补丁。远端仓库尚未包含本轮修改。

## 下一账户从这里开始

1. 检查分支、HEAD、`git status --short` 和本轮文件差异，确认其他账户是否已有后续修改；在 `docs/COORDINATION.md` 声明负责范围。
2. 获取用户实际出现问题的漫画路径及具体表现，在 Windows 与手机真机分别复现。优先记录单页尺寸、单页编码大小、图像格式、压缩包格式、冷打开时间、连续翻页和放大拖动；分开判断解压等待、解码等待、白屏、闪退与显示错误。
3. Android 检查 `nativeBitmapDecodes` / `nativeTileDecodes` 是否增长，以及缓存和局部分块是否仍守住预算。Windows 检查额外 Worker 是否确实为 0，再记录进程内存峰值。不要把“绕过额外重采样”当作“Windows 已有区域解码”。
4. 若实际文件仍卡顿，优先处理剩余内存与 I/O 问题：Windows 仍会由 Chromium 完整解码原图；Android 仍先读取编码数据，且已有 100,000,000 像素源图上限。需要针对实际文件设计可见区域读取或受限的预览/预取，不能直接强制全分辨率加载或盲目放宽上限。
5. 检查大图密集网点的画质取舍。快速路线依赖系统采样，可能与自定义低通滤波的网点表现不同；本轮保留了普通图的高质量路线，没有新增用户设置。
6. 两端已按用户要求升为 1.1.56 并生成本地包。实际漫画验证通过后，按用户后续指示选择性提交和发布，并更新本报告。完整 UI 套件和手机真机回归尚未执行，不能把专项通过写成全量验收。

## 复跑命令

在仓库根目录执行；JDK 使用本地已有安装。模拟器需要先启动，且测试脚本只允许专用 `emulator-*`。

```powershell
npm run typecheck
npm test
npm run test:dom
npm run build:renderer
npm run build:electron
node --test --test-concurrency=1 tests/desktop-images.electron.cjs tests/large-images.electron.cjs
npx playwright test tests/reader-halftone.spec.ts --grep 'halftones stay filtered|80 MP|software'
npm run build:android:renderer
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-android.ps1 -JavaHome '.cache/android-tools/local-jdk17-20261027/jdk-17.0.20.1+1' -OutputDirectory 'release/OmiComic-1.1.56-本地版'
# 仅在专用模拟器安装上面生成的测试包后运行：
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-android.ps1 -Serial emulator-5680 -Mode large-images -ExpectedVersion '1.1.56' -JavaHome '.cache/android-tools/local-jdk17-20261027/jdk-17.0.20.1+1'
```
