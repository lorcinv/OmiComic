# ComicScreen 连续阅读手势与全屏对照

日期：2026-11-07。范围：用户提供的 ComicScreen APK、项目已有 JADX 解包结果，以及 Android 对应接口定义。本文记录静态机制，不作为两款软件的运行速度对比。

## 文件与证据

本次由 REA 重新打开并检查 `D:/下载/手机/漫画阅读器(ComicScreen).apk`。文件为 27,794,950 bytes，SHA-256 为 `a565e7469804864e342a52188327994237c04952e548fb55d80038ed6cfa5baa`；与 `.cache/comicscreen-audit/ComicScreen.apk` 的现场计算结果一致。已有清单标识为 `com.viewer.comicscreen`，版本 2260。

REA 归档检查包含 1,667 个文件出现项、1,541 个去重内容节点，完整性矛盾为 0。它核验的是 APK 内容清单，不证明界面执行行为。

- 归档清单 Evidence：`ev_303070e48e46f4073d51069377c5eb99b18ac3947f12f00e7362da075e306063`。
- 归档检查 Evidence：`ev_51af57e6bcd83382bd5b9737c750436fe8d61a87fd06441cc99818559cf75e15`。
- 摘要 Evidence：`ev_81a3166db32fe63c1f3901f21b5f408c3bfb2fecfe0224f007eab069a550ea2a`。
- Artifact manifest：`agm_6f5a86dae59f1eb6748123f523e550b561683c6e2e4386dec0fa99831fce9818`。
- 完整导出、已查文件摘要和带行号摘录保存在 `.cache/experience1186/comicscreen/`。REA 会话已关闭。

REA 的 Android 方法接口因未配置 `REA_JADX_MCP_JAR` 不可用。本次方法分析沿用项目现有反编译内容，没有重新安装工具。原 JADX 日志报告 20 个反编译错误，部分源码存在类型还原痕迹；以下结论限于已定位的调用与数据流。

## 连续阅读真正使用的手势路径

下表路径相对 `.cache/comicscreen-audit/decoded/sources/`。

| 位置 | 观察及含义 |
| --- | --- |
| `com/viewer/comicscreen/ImgActivity.java:8722–8744` | 阅读容器在 `ImageViewPager` 与 `ImageRecyclerView` 间切换；连续容器分别设置横向或纵向布局。连续阅读不能只用 ViewPager 的翻页实现来解释。 |
| `com/viewer/widget/ImageRecyclerView.java:16,157–176,243–266` | 继承 `J3.B`，关闭条目动画；横向处理正反阅读方向，纵向使用对应 LayoutManager；触摸拦截先交给父类。 |
| `J3/B.java:19,292–343` | 父类为 AndroidX RecyclerView。默认单指动作交给 RecyclerView；多指缩放另行处理。放大状态有独立矩阵和平移比例，不能把该比例套给默认连续拖动。 |
| `androidx/recyclerview/widget/RecyclerView.java:5842–5845,6073–6081` | 收集 MotionEvent，松手用 VelocityTracker 计算当前指针的横纵速度，再进入 fling。 |
| 同文件 `6088–6139` | 拖动依据相邻触点的实际位置差；初次起拖扣除触摸阈值，随后直接滚动，并向预读调度报告方向和位移。没有发现默认连续拖动阶段额外放大位移的乘数。 |
| 同文件 `5277–5318,6746–6751` | 使用设备的触摸阈值、最小与最大甩动速度，先筛掉过慢的松手并限制最大值，再启动惯性。 |
| 同文件 `356–372,415–454`；`androidx/core/view/W.java:1270` | 将释放速度交给 OverScroller.fling，逐帧读取当前位置，应用本帧位移，并通过 postOnAnimation 续帧。 |
| 同文件 `5859–5862` | 新手指按下时把正在惯性滚动的状态切回拖动，允许立即接管。 |

因此，可借鉴的核心是**手指拖动时按位移跟随，松手后按实际释放速度继续滑行，并逐帧减速**。静态证据不能证明 ComicScreen 有额外的“触摸加速倍率”，也不能证明其惯性参数必然更适合 Omi。

另一个路径是单图缩放：`H0/b.java:94–149` 采集位移和速度，`H0/m.java:127–150` 更新图片矩阵、启动惯性，`H0/m.java:301–365` 使用带图片边界的 OverScroller。它由 PhotoView 使用，与连续列表的主手势路径分开；两者都没有在常规拖动中等待一段缓动动画才追到手指位置。

## 全屏与挖孔区域

`ImgActivity.java:8377–8380` 在全屏设置启用时写入系统界面标志 5894，包含隐藏状态栏、隐藏导航栏、全屏布局与沉浸手势；`8504–8507` 在工具栏显示时改为布局标志 1536。`8909–8927` 将这两项与阅读工具栏的显隐相连。标志含义依据 [Android View 接口](https://developer.android.com/reference/android/view/View#SYSTEM_UI_FLAG_IMMERSIVE_STICKY) 核对；系统栏可以由边缘手势暂时呼出。

`ImgActivity.java:8693–8703` 按横竖屏设置选择 `layoutInDisplayCutoutMode`，`9083–9099` 在设备旋转后重新应用。值 1 对应允许利用短边挖孔区，值 2 对应避开挖孔区，含义见 [Android 窗口布局接口](https://developer.android.com/reference/android/view/WindowManager.LayoutParams#layoutInDisplayCutoutMode)。

`p168s3/i.java:191–209,276–277` 表明：横屏和竖屏的挖孔扩展默认关闭，全屏默认开启。中文设置资源也把“扩展图像区域至挖孔屏挖孔处”与“隐藏状态栏、导航栏”分列。因此，全屏隐藏系统栏和利用挖孔区域是两项独立行为，不能将前者等同于后者。

`D3/e.java:209–235` 还会检查多窗口与部分设备条件后调整全屏设置；这只能证明存在兼容分支，未逐项确认其中的设备判定。

## 对 Omi 本轮改动的依据

1. 保留慢拖时的直接位置跟随；优先改善释放速度采样、快甩后的滑行距离和减速连续性。按下止动、反向拖动、边界停止、多指切换必须一起验证。
2. 将漫画可用画面与工具栏安全区域分开处理。正文可以扩展到顶部，按钮仍避开挖孔和系统手势区；横屏、竖屏、手机和平板都按实际窗口尺寸重新计算。
3. 启动优化继续以 Omi 自己的首屏路径和前后测试为准。ComicScreen 的上述代码只能提供实现参照，不能据此宣称 Omi 的开书耗时已降低。

本次没有执行 ComicScreen，也没有测得它的拖动延迟、帧率、首屏耗时或平板表现；没有将反编译实现复制到 Omi 产品代码。
