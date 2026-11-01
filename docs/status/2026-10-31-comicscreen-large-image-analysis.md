# ComicScreen 大图读取静态分析

日期：2026-10-31。此文件为协作分析产物，不包含 Omi 源码修改。

## 结论

ComicScreen 的大图路线是“先探测像素尺寸 → 按屏幕和模式确定系统解码采样 → 超过绘制尺寸上限时用小底图加可见区域分块 → 后台处理与缓存”。它确实使用 Android 原生图片解码，但没有在已核查路径中发现“超过 5 MB 即全尺寸原图、完全取消采样”的策略。事实上，分块和普通路径都明确设置 `inSampleSize`，分块底图还调用系统缩放。

对 Omi 可借鉴的是绕过昂贵的自定义逐像素重采样，并保留系统解码时降采样、预览图、局部分块及内存预算。压缩文件字节数只能作为附加阈值；像素数、长边和预计 RGBA 内存才决定解码风险。4000 × 6000 的 ARGB_8888 图片仅基础像素就约 96 MB，与文件压缩到多少 MB 是两回事。

## 目标与证据身份

- 用户输入：`D:/下载/手机/漫画阅读器(ComicScreen).apk`，27,794,950 bytes。
- 本地缓存输入：`.cache/comicscreen-audit/ComicScreen.apk`，同为 27,794,950 bytes。
- 本轮实测两者 SHA-256 相同：`a565e7469804864e342a52188327994237c04952e548fb55d80038ed6cfa5baa`。
- 复用本地 `.cache/comicscreen-audit/decoded/sources/` 的 JADX 反编译树。既有清单报告记录 package `com.viewer.comicscreen`、versionName/versionCode 2260。
- REA `inspect_android_package` 本轮返回 `capability_unavailable`，原因为 `REA_JADX_MCP_JAR` 未配置。没有修改工具配置、下载组件或执行 APK。本文件结论来自本地反编译静态代码，不冒充 REA 方法分析结果或运行时测试。
- 既有 `.cache/comicscreen-audit/decompile.log` 结束时记录 20 个错误；相关方法中存在反编译重复代码警告。下文不依赖有歧义的浮点/整数表达式还原来给出精确性能或内存数值。

## 可复查的实现链路

以下行号均相对于 `.cache/comicscreen-audit/decoded/sources/` 下的文件。

### 1. 普通 PNG/JPEG 先读尺寸，再系统降采样

- `p231z3/c.java:38–44,63–66,89–92,126–131`：文件描述符、文件、流、字节数组几条路径均以 `inJustDecodeBounds = true` 探测宽高和 MIME。
- `p087j3/a.java:46–65`：先 `e()` 读图片信息，再复位或重开流，以 `BitmapFactory.decodeStream(..., g(...))` 解码。
- `p087j3/a.java:146–153`：`e()` 使用 `inJustDecodeBounds`；JPEG 还考虑 EXIF。
- `p087j3/a.java:160–184`：`g()` 根据模式和源/目标尺寸决定 `inSampleSize`，再选择像素配置。
- `p141p3/a.java:185–247`：滚动模式按宽或高计算采样；常规策略考虑方向、4000 px 边长、超过 32766 px 的极长边、长图比例及跨页。
- `p141p3/a.java:53–124`：预计解码像素过多时可使用 `RGB_565`；这是有画质取舍的路线，不建议 Omi 无条件照搬。
- `p087j3/a.java:67–103`：仅 EXACTLY/EXACTLY_STRETCHED 等指定模式追加矩阵缩放；普通阅读配置是自定义采样模式，见 `ImgActivity.java:9021–9029`。

### 2. 何时进入大图分块

- `com/viewer/comicscreen/ImgActivity.java:6709–6731`：`F1()` 先读 MIME/尺寸，调用 `w2()` 决定是否用 tile；GIF 和动画 WebP/AVIF另走动画路径。
- `ImgActivity.java:7700–7709`：`w2()` 比较图片宽高与设备的绘制尺寸上限；另有阅读设置和跨页条件，并检查解码器支持性。这里没有文件 5 MB 判断。
- `com/viewer/widget/ImageToolbar.java:21–28`：绘制上限来自 `Canvas.getMaximumBitmapHeight()`，最低 2048。
- `D3/c.java:260–261,335–337`：保存绘制上限，并传给普通采样工具。
- `I3/q.java:1933–1955,2000–2012`：排除 GIF/BMP/AVIF 和动画 WebP；PNG/JPEG/静态 WebP 用 `BitmapRegionDecoder` 做区域读取可用性探测。
- `ImgActivity.java:4906–4910`：`F1() == 1` 时调用 `A3.b.c()`；另一个翻页路径见 3165–3168。

### 3. 先显示小底图，再解码视口中的分块

- `A3/b.java:264–328`：`AsyncTask.doInBackground` 建立 `BitmapRegionDecoder`，可从路径、文件描述符或流读取；按屏幕比例设置 `inSampleSize`，先生成整图缩略底图，随后调用系统缩放。OOM 时将采样值再乘 2 重试。
- `A3/b.java:422–423`：后台入口。
- `A3/b.java:444–558`：从 ImageView/ScrollView/RecyclerView 取得变换和可视区域；矩阵变化时清空旧待办队列（538–540）；根据缩放选择采样层级。
- `A3/b.java:561–624`：仅对与视口相交的 tile 查询缓存、入队；tile 尚未就绪时绘制小底图中对应区域，因此不等全部高清块才出画面。
- `A3/b.java:147–191`：后台线程取任务，`inSampleSize = 1 << level` 后调用 `decodeRegion`；解码器访问受同步保护；可选滤镜和旋转后入缓存。
- `A3/b.java:140–142,187–191,651–653`：退出通过中断；这里的队列清理只取消尚未取出的任务，不能据此声称正在运行的原生 decodeRegion 可即时取消。

### 4. 缓存与后台调度

- `A3/b.java:104–118`：分块使用 `LruCache`，按 `Bitmap.getAllocationByteCount()` 计量，不按图片张数。
- `A3/b.java:690–735`：每个 tile drawable 持有阻塞任务队列与后台解码线程；全局 tile 缓存根据屏幕尺寸计算容量。
- `J3/w.java:7–11` 与 `p060g3/e.java:231–249`：普通图片加载器配置 4 个工作线程、Java 线程优先级 4、FIFO。
- `p060g3/h.java:229–242,399–446`：检查目标控件已回收或已改为另一图片；相同任务用锁合并；解码前后检查目标有效性，丢弃过期展示。
- `p060g3/a.java:89–98`：普通加载器默认内存缓存预算为应用 memoryClass 的 1/8。
- **不要过度概括普通阅读页缓存**：`ImgActivity.java:9022–9029` 的 `.v(false).w(false)` 对应普通内存/磁盘缓存关闭；`.v/.w` 字段见 `p060g3/c.java:166–173,237–243`。缩略图配置（9009）启用内存缓存。大图 tile 自己的 LRU 则明确存在。

### 5. 原生库职责

- `p231z3/p.java:184–194`：AVIF 单独解码；TIFF 检测命中走 OpenCV；普通 PNG/JPEG 回到 `super.a()`，即上述系统 `BitmapFactory`。
- `p231z3/p.java:65–93,120–169,173–182`：TIFF 的 OpenCV 路径会读取 Mat、按需要缩小、转 Bitmap，加载 `ndk_comicscreen(_neon)`。不能把这个库名等同于所有格式都用某个神奇的大图原生解码器。
- `ImgActivity.java:5987–5996`：分块可选图像效果处理会进入另一套原生滤镜。
- `p231z3/i.java:152–158`：动画 ImageDecoder 路径同样设置目标采样值；线程池是 4 线程（262–263）。

## 对 Omi 的实现建议

1. 将“原生直读”定义为跳过 Java/JS 自定义重采样，继续采用 Android 系统 `inSampleSize` 控制解码内存。不要把它实现为强制 `sample = 1`。
2. 在已知图片头宽高后制定策略：压缩字节超过约 5 MiB、像素数过大或任一长边过大时走快速路径。强压缩超大 PNG 可能只有几百 KB，必须有像素门槛。
3. 大 PNG 在快速路径内不要再先全尺寸解码条带、逐行 Java 低通缩放；优先系统采样。必须用质量路径的文件，限制质量改进的源像素工作量或按视口局部处理。
4. 首屏尽快显示受预算约束的底图；放大时只补当前视口分块。变化时取消未执行预取，避免旧任务阻塞新页。
5. 防止文件读入、PNG 特殊解码、分块补图各自再次复制整份压缩数据。后续可沿文件/FD路径复用区域解码器，但要核查线程同步、文件生命周期及缓存淘汰。
6. 验证时分别记录读文件/解压、尺寸探测、解码、重采样、首帧耗时和峰值像素内存；只看压缩包总 MB 或总打开时间无法证明是哪一段变快。

## 边界与后续

- 已回答：是否采用“不采样原图”、普通图/大图分流条件、分块机制、系统解码入口、缓存与过期任务检查、PNG/JPEG 与 TIFF 原生库职责。
- 未做 ComicScreen 运行时性能采样，不能声称它在所有设备或所有大图都不卡顿。
- 未逐函数分析原生库；以上原生库职责以 Java 调用入口为界。
- 本地反编译属于静态还原；不复制其实现到 Omi，只借鉴通用架构。

## 关键源文件 SHA-256

| 文件（相对 decoded/sources） | SHA-256 |
| --- | --- |
| A3/b.java | 0e9317f91cd95e81bbaf24aea17b850e314e91a7ae4a59af5e8f890fe7c32e9f |
| p087j3/a.java | 048b3e09d99812b677354df81b11605b906ce87b46c1e8dd48f7ca9538af7dd3 |
| p141p3/a.java | 3bed75fb5d0049eb729a7a3caea2796a7009063b2475dc1a915d75821e8bda69 |
| com/viewer/comicscreen/ImgActivity.java | 1bbdce618edbce52594bc91b05a824ef7e700c288959f1cef41f7044b502a6f9 |
