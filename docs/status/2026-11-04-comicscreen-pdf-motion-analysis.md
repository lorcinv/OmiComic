# ComicScreen PDF 与翻页对照

用户 APK：`D:/下载/手机/漫画阅读器(ComicScreen).apk`，27,794,950 bytes。SHA-256：`a565e7469804864e342a52188327994237c04952e548fb55d80038ed6cfa5baa`，与既有本地反编译输入一致。

本次复查现有 JADX 代码并用 REA 核验 APK 归档清单。该 APK 只有 ARM64，当前测试设备为 x86_64 模拟器，因此没有给出 ComicScreen 的同机运行速度。REA 的定点 JADX 服务缺少所需 JAR，方法实现依据为已有本地反编译；文件摘要与工具返回证据另存验证目录。

## 实现依据

| 路径（相对 `.cache/comicscreen-audit/decoded/sources/`） | 观察 |
| --- | --- |
| `F3/b.java:105–112,177,205–222` | 保留文件描述符与 PDF 会话；查询尺寸，打开需要的页，直接渲染到 Bitmap。 |
| `com/shockwave/pdfium/PdfiumCore.java:410–428` | 将 Bitmap 直接传入 `nativeRenderPageBitmap`，没有先编码成图片文件再交给另一个显示引擎。 |
| `com/viewer/widget/ImageViewPager.java:18` | 采用原生 ViewPager；图片缩放／滚动与翻页之间有手势协调。 |
| `androidx/viewpager/widget/b.java:1306,1393–1407,2102` | 手势使用 VelocityTracker，滚动由 Scroller 和逐帧位置更新驱动；显示阶段不重新解析整本文档。 |
| `A3/b.java` | 大图采用底图、可见区域分块和按位图字节计量的缓存；既有详细记录见大图分析报告。 |

这些代码能说明读取和显示机制，不能单凭静态分析证明某个设备的启动时间或帧率。

## Omi 1.1.81 的退步及本次修复

PDF 在系统渲染后又进行 PNG 编码、网页图片解码和显示重采样，增加了首屏和预载成本。本次改为直接将 PDF 位图交给现有原生 Canvas；放大时按视口重新渲染 PDF 区域，预览单独使用小尺寸画面。[Android PDF 渲染接口](https://developer.android.com/reference/android/graphics/pdf/PdfRenderer.Page)支持目标位图、区域裁剪和变换矩阵。

图片 EPUB/MOBI 与长图也统一进入原生绘制、内存预算和相邻页队列。长图正文直接区域解码，不再先转成 JPEG 再解码。文字书复用章节解析结果，分页遍历每约 4 ms 让出线程，滑动期间暂停后台分页；只有页数实际改变时才更新页面表。原生画面同步保留逐帧位置更新，减少重复样式读取和无关界面观察。

本次保留了原有界面、阅读手势、缓存限制和兼容回退。未增加第三方 PDF 引擎；最终效果以 Omi 旧版／新版的同机测试、完整阅读流程和成品验证为依据，见本轮工作报告。
