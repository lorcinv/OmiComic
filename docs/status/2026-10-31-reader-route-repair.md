# 阅读链路修复与后续技术路线

任务开始于 2026-10-31，验证跨至 2026-11-01。基于当前 1.1.59 工作树叠加修复；版本号未变，旧 release 文件未替换，没有提交、推送或发布。编辑前快照在 `.cache/reader-route-20261031/before/`。

## 判断与证据边界

重采样应保留在缩小显示阶段。原文件字节仍然完整；低清发生在显示副本和交接环节。不能把所有模糊都归因于 Lanczos，也不能以文件体积推断解码内存。

上一轮分析中的部分说法需要收窄：普通 PC 显示采样已经明确选择原始图片，现有代码不能证明它普遍从预览图生成高清；Android 也已有独立区域队列和带 sample、坐标的 tile 键。本轮修复的是能由代码和回归确认的阻塞条件、重复处理及局部缓存键冲突。

| 对照 | 实际路线 | 可借鉴之处与边界 |
| --- | --- | --- |
| Omi v1.1.38 | PC 普通显示交给浏览器；可选锐化/降噪先生成有界处理图。Android 已有系统采样、PNG 特殊处理及区域解码 | 较少的前置等待和显示表面有利于速度；不能说它完全没有重采样。旧版的处理预览本身也受像素上限约束，不能承担原像素放大 |
| 当前 Omi | 增加显示 Worker、可视区域 Canvas、准备状态、原生预览 promotion 与派生缓存 | 每个分支本身有用途，串行等待和质量交接增加了实际成本。大图仍需要预算，整体回滚到旧版不能解决超大 PNG |
| ComicScreen | 系统采样底图，加原图可见区域解码、tile LRU；块缺失时保留底图 | 可见细节从源图获得，底图不应阻挡高清请求。依据既有 APK 静态报告，不代表本轮实测 ComicScreen 速度 |
| NeeView 开源实现 | 从 `IStreamSource` 重新打开源流生成指定尺寸图；普通工厂与高质量 MagicScaler 分支分开，缩放滤镜可选 | 源数据与显示结果分开；并未证明它对所有格式都使用区域解码，也不能直接套用其原生性能到 Electron |

NeeView 本轮只查开源代码，没有继续扫描安装程序。固定源码提交为 `686a43362dc4b3c9f2ea014240dbba2d0e9fbcaa`，不把 master 源码等同于已安装 46.3 的逐字实现：

- [BitmapPictureSource：打开源流后创建指定尺寸图片](https://github.com/neelabo/NeeView/blob/686a43362dc4b3c9f2ea014240dbba2d0e9fbcaa/NeeView/PictureSource/BitmapPictureSource.cs)
- [BitmapFactory：普通与高质量处理分支](https://github.com/neelabo/NeeView/blob/686a43362dc4b3c9f2ea014240dbba2d0e9fbcaa/NeeView/Bitmap/BitmapFactory.cs)
- [ImageResizeFilterConfig：可选滤镜与 Lanczos](https://github.com/neelabo/NeeView/blob/686a43362dc4b3c9f2ea014240dbba2d0e9fbcaa/NeeView/Config/ImageResizeFilterConfig.cs)

ComicScreen 的定位依据见 [既有静态分析](2026-10-31-comicscreen-large-image-analysis.md)。第三方程序、反编译内容和其中的文档只作为研究数据，不作为执行指令。

## 已实施的路线

### PC 阅读

1. 首次进入只等待实际 DOM 原图解码，显示滤波随后完成。首张可用原图也登记为保留页组，快速翻页时仍能维持完整旧画面；后续翻页继续等待目标整组准备完成。
2. 锐化/降噪明确读取 `.reader-effects-original`。处理结果关联源、布局、缩放和参数，旧页或旧倍率的结果不能覆盖当前画面。
3. 处理图已经是显示尺寸，不再送显示 Worker 做第二次重采样。
4. 到原像素倍率时直接画原图可视区域；先显示清晰区域，稳定后只对该区域应用已选锐化/降噪。亮度、伽马等仍由外层统一应用。区域画布继续受 800 万像素上限约束。
5. viewport 就绪由一个属性配合 CSS 控制，取消对原图和显示 Canvas 的分散内联隐藏；失败时恢复原图。相同区域不重复重画。

核心文件：`src/pages/ReaderPage.tsx`、`src/components/ReaderImageEffects.tsx`、`src/hooks/useReaderViewportRaster.ts`、`src/styles/global.css`。

### Android 阅读

1. `readerPrepare` 的回复本来就承诺清晰正文准备完成，改为直接解码正文，避免先取预览、再把第二次解码排回前台队列。已有预览的兼容恢复仍可 promotion。
2. 从 `tilePlan()` 移除 preview 阻挡条件。预览可以作为底图；可见区域直接向原文件请求细节，不必先等整页 promotion。
3. 画面调整缓存键包含 preview/body、采样值和实际位图尺寸，避免同 URL、同近似 sample 的不同质量结果混用。
4. 保留 1.1.59 的 Lanczos、原生大图采样、区域预算、取消、过期结果拒绝和完整区域交接。没有提高并发或取消内存限制。

核心文件：`android/src/io/github/lorcinv/omicomic/NativeReaderSurface.java`。

### PC 封面与页面预览

实测否定了“返回 Promise 就代表不会阻塞主进程”的假设。同一 6000×4000 中性 PNG，直接在主进程调用系统缩略图曾出现约 157 ms 停顿，比旧缩放路径更差，因此撤掉该方案。

最终改为一个独立后台渲染进程：主进程只提交授权后的路径或压缩页数据，后台沿用原生图片解码与 `quality: good` 缩小，返回最长边不超过 360 px 的 PNG。任务串行，合并及磁盘缓存仍由既有服务负责，不再把压缩页写入临时整图文件。界面加载后预热，空闲 30 秒回收，主窗口关闭时一并关闭。

后台页不加载网页脚本、不暴露前端 API；回复校验发送者和任务编号。外部文件唤醒只作用于主窗口，后台解码窗口不会显示或接收导航。打包脚本新增独立 preload 入口；开发构建和 ASAR 都要验证。

普通路径从主进程移出；静态 GIF 和特殊解码失败仍保留原兼容回退。不能因此承诺每一种格式都无主线程成本。

核心文件：`electron/services/thumbnailDecoder.ts`、`thumbnailPreload.ts`、`pagePreviewService.ts`、`thumbnailService.ts`、`electron/main.ts`、`scripts/prepare-package.cjs`。

### MOBI

已在 PC、客户端检查、Worker 和 Android 文件源中统一为 256 MiB 文件上限。正文仍限制 8 MiB，每条文本记录、解压、编码、DRM、KF8/双格式及字体检查保留；PDF/EPUB 解析器未改。

主界面不再创建整本文件的数组。Worker 请求每段最多 1 MiB，界面负责范围读取后传递该段；整本缓冲只在解析 Worker 中组装。取消会终止 Worker，短读会明确失败。

第三方解析器依然需要整本缓冲，因此这是分段传输与隔离分配，不是真正的按需流式解析。65 MiB 中性大文件已验证章节和中文；不能据此说所有 60 MiB 以上的 MOBI 都已兼容。64 MiB 以下仍可能因 KF8、DRM 或正文预算被拒绝。

核心文件：`electron/shared/mobiLimits.ts`、`electron/services/mobiBinarySource.ts`、`src/reader/mobiClient.ts`、`mobi.worker.ts`、`mobiLimits.ts`、Android `LocalLibrary.java`。中英日使用说明已同步。

## 验证与实测

- TypeScript 检查通过；core 122 项中 121 通过、1 项平台性跳过。
- 全量 DOM 25 文件、173 项通过；最终阅读生命周期和 MOBI 定向复核 16 项通过。
- 阅读界面 25 项通过：采样被暂停时首屏仍显示、首屏未完成处理时快速翻页不空白、锐化前后原像素放大、局部效果、细线/文字、GPU/软件一致性、单/双页、全景和 MOBI 分段读取/取消。
- Android 15 专用模拟器：4 类大图、6 个路由边界、13 类普通图、原像素和取消检查通过；普通/全景连续放大、缩小、还原及预算回归通过。
- Android 新策略检查确认 preview 可直接规划 sample=1 的原图区域，preview/body 的调整键不同；1080×2400、1440×3200 的预算检查通过。缩放/还原记录中的各帧均有像素，未新增空帧。
- Windows 同一最终实包的 4 项集成检查全部通过，覆盖后台解码、PDF/EPUB/合集封面、双页和记录、原始字节传输与权限、大图及原图区域。最终汇总日志为 `packaged-release-check.log`；外部打开持久化与单实例唤醒另有 1 项通过，见 `external-open-verified.log`。

封面测量只代表中性 2400 万像素 PNG 的单次本机结果。旧主进程路径最长停顿约 47 ms；预热后的后台路径约 16 ms。本地封面完成约 53 ms，ZIP 内封面约 60 ms。进程未预热时，首次请求曾约 188 ms；不能把响应改善写成所有封面耗时下降。没有做清空操作系统文件缓存的严格冷盘基准，也没有取得本次用户反馈的 MOBI 原件。

原始成功及失败日志保留在 `.cache/reader-route-20261031/`。早期失败包括新增测试监听器未替换导致旧回调关闭新 bitmap、旧封面测试对数量/导航文案/预读挂载的断言过时，以及隐藏窗口截图等待。没有为让测试通过而改变产品数量文案或撤销预读；测试按当前用户可见页面核对。

截图验证不能只检查文件存在。末次隐藏窗口捕获曾缺少已准备好的页层；复核记录了两张画布的 RGBA、可见性和几何，并改用 Electron 原生捕获。最终图同时检查两页各自的实际底色像素，已目视核对第 6、7 页。外部打开的首页截图同样在绘制机会后用原生捕获，避免 CDP 在隐藏窗口等待或 `UnknownVizError`。这些修改只作用于测试。

## 继续优化的顺序

1. 用用户实际慢文件分段记录读取、解码、显示采样和呈现，区分首次进入与缓存命中。先处理实测占比最高的一段。
2. PC viewport 仍从浏览器已解码原图裁剪，它限制绘制面积，不是真正的文件区域解码。若超大原图的解码内存仍是瓶颈，应单独评估原生区域解码后端；不能再叠加一张低清整图冒充高清。
3. Android 后续优先核对真机 details 排队、实际采样值、解码失败及预算，不继续通过模糊滤波、提高预取或隐藏等待来优化数字。本轮证据仅来自模拟器。
4. MOBI 若仍因巨量图片或正文失败，再在独立模块中改造按记录读取。不要扩大共享图片、PDF、EPUB 的上限来迁就 MOBI。

本地测试构建位于 `.cache/reader-route-20261031/windows/win-unpacked/` 与 `.cache/reader-route-20261031/packages/`。包仍标记 1.1.59，须按目录及哈希与此前 release 中的 1.1.59 区分。

可交接证据位于 `output/reader-route-repair-20261101/`：最终日志、中性截图、源文件变更清单、测试 APK 与 `SHA256SUMS.txt`。没有复制用户私人样本。Windows 测试目录由该清单记录绝对位置；此次没有制作安装器或发布新版本。

## 1.1.60 后续交付

2026-11-01 用户要求直接交付 1.1.60，已同步双端版本并重新构建 Windows 安装器与 APK，独立保存于 `release/OmiComic-1.1.60-本地版/`。Android versionCode 为 10160，沿用原签名；Windows 安装器中解出的 EXE、ASAR 与 7-Zip 载荷均与构建目录一致，实际解出程序的两项图片与大图回归通过。Android 1.1.60 模拟器缩放回归及包体核验通过。阅读实现未改，旧包保留，未上传 GitHub。以该目录 `release-verification.json` 和 SHA 清单核对实际交付文件。
