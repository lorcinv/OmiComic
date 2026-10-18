# OmiComic Android

Android 版本复用 Omi 的阅读规则和主题，并单独设计手机布局；Java 原生层负责系统目录授权、文件读取、静态漫画图片解码与 Canvas 显示、音量按键、文件重命名及删除。React/TypeScript 保留 Omi 界面和交互，原生图片与界面之间只传布局坐标和状态。

当前发布版本为 **1.1.38（2026-10-18）**。修复首次从首页进入资源库的动画闪跳，移除手机 Omi 图标中心白色细描边；包含 1.1.37 的时钟图标、安全修复和加载优化。使用原发布证书覆盖安装。[下载](https://github.com/lorcinv/OmiComic/releases/tag/v1.1.38) · [验证](verification-1.1.38.md)。

1.1.22：后台返回等待网页首帧就绪后再绘制；窗口完全退到后台后暂停网页。开屏接续系统原有启动画面，由原生渲染线程完成中央展开，避免清空后重绘。开屏临时底图最多 8 MiB，过渡结束释放引用；后台返回不新增截图缓存。

1.1.21：系统启动画面后，首页从中央向外展开；移除内部启动图标。桌面图标返回复用已有主页面，后台恢复不重播旧转场；漫画进出与快速切换使用已绘制的完整画面衔接。阅读解码、预读和缓存策略保持不变。

1.1.20：应用启动在首页首帧绘制后淡入；两个入口的设置显示在同一顶层，避免文字被遮罩压暗。长按直接蓝色多选，右侧保留全选，排序默认全部选中。默认开启上下阅读工具栏空闲 3 秒自动隐藏，可在「设置 → 默认阅读」关闭；操作面板与拖动预览期间暂停计时。

1.1.19：首页设置独立打开，不经过图标展开与资源库；统一手机弹层遮罩，首次进入线性变暗，叠加和换层保持灰度。精简阅读、缓存设置，关于页增加手机使用说明。「外观与主题 → 语言」支持中／英／日并保存选择，用户内容保持原文。原生图片解码、预读和缓存实现未改。

1.1.18：普通翻页保留新预读窗口内的有效任务，优先准备阅读方向前方的清晰底图，当前页先显示。快速翻页期间延后底图编码，停稳后优先补存当前页；预览条只等待实际安排的邻页，预读失败可回退到缩略图。内存和磁盘预算不变。

1.1.17：可见 PNG 在低清补载取消后自动恢复，临时错误最多尝试三次；带色彩配置／交错 PNG 的分段工作缓冲按设备堆大小限制且串行处理。退出清理临时原页和流式副本，异常结束残留在下次启动后台清理；PNG 清晰底图独立保留，最多占阅读磁盘总预算的一半且不超过 128 MiB。

1.1.16：原生预览地址对应的位图被淘汰后，按可见范围后台补载；快速滑动时始终按实际滚动位置更新预览窗口，避免慢帧与惯性造成空白。正文优先、过期请求取消、4 MB 预览小图上限继续生效。书架「打开路径」移至操作列表最底部。超 1 GB 本地 ZIP 的实测与格式兼容性记录见本版报告；无法随机读取的流式来源仍有单本 1 GiB 缓存上限。

1.1.15：各栏目独立保存卡片模式、列数和列表封面尺寸；书架内漫画新增打开路径。首页限制图标命中范围，最近阅读在漫画完全进入后更新。相邻预览优先读取，快速跳页取消旧任务，仅显示静态选中框；大图重开命中处理缓存时跳过原图读取。详情文件名允许系统长按复制，其余展示文字禁止选择，编辑字段正常输入。相邻原生预览保留最多 4 MB 的小图回退，完整位图被回收后不会直接消失。

1.1.14：默认尺寸按屏幕密度停止多余高清图块，放大区域须能完整容纳于预算内；PNG 缩小时先过滤，避免抽点引起摩尔纹。选中拖动预览与正文共用原生图像；封面只优先读取可见范围，逐张显示。处理后的大图副本纳入“阅读页面磁盘缓存”，原有预算与清理按钮一并生效。首页／资源库从 Omi 图标展开与收回，约 280 ms。

1.1.13：首页轻触和长按分离；底栏按栏目顺序左右衔接（210 ms），目录居中渐变（180 ms），详情封面衔接（220 ms），阅读切入保持约 240 ms。预览以真正解码完成控制并发，选中页抢先；复用原生阅读位图，换书取消旧工作并收缩缓存。几何按物理像素对齐，每帧合并，清晰图块整批发布。

1.1.12：ZIP/ZIP64 常用方式按偏移直接读取；目录 URI 和列表保存在 SQLite；打开漫画不等待保存队列。静态图片使用原生后台解码、内存缓存、可见区域图块和完整帧替换；已有同页缩略图时超大图可先显示、后台补清晰图。动态 GIF、PDF、EPUB 沿用兼容显示通道。界面由原生合成快照衔接，前进和返回约 240 ms，栏目切换约 140 ms。

1.1.11：手机侧栏改为连续跟手开合，支持半途反向和取消；漫画首张画面准备好后从右侧短促进入，目录、详情、设置与各栏目切换保留旧画面衔接。相邻页预解码并复用图片节点，快速返回会取消旧请求；书签页码与日期增加圆点分隔。

1.1.10 修复侧栏关闭回闪，缓存目录树在首帧呈现；打开漫画和切换目录不再短暂显示文件名或加载文字。卡片元信息为 `10/12 · 83% 0.4MB`，书签页码与日期同排。手机自动阅读在点画面、翻页和拖动后继续，设置打开时临时停留。雾蓝背景改为少蓝的柔白色，北境保留冰雪蓝灰。继续保留已读压缩包页面磁盘缓存、独立阅读请求队列，以及设置中的缓存容量、用量和清理。

保留全景左右顺序、三层书架封面、书签日期，以及标签与简介独立编辑。侧栏目录使用持久索引，刷新或文件操作后失效重建。阅读预览仅拖动时唤出，点击外部关闭，背景不透明度 50%，不做背景模糊；选中框使用内部描边，避免顶部裁切。浮动分页背景不透明度 80%，点击中央数字输入页码。详情右上角可打开标签管理抽屉；搜索设置支持逗号条件的任一／全部匹配。书架封面为三张错位叠放，保留浅蓝排序蒙版。

手机布局参考用户仓库 [EhViewer-test](https://github.com/lorcinv/EhViewer-test/tree/634b281c6912b8ab2fb2117240c1fda0c677b6c0) 的 `item_gallery_grid.xml`、`item_gallery_list.xml`（封面与标题分离、列表左图右文），以及 [Komikku 阅读设置](https://komikku-app.github.io/docs/guides/reader-settings) 的中央唤出菜单、音量键开关和反向设置。保留 Omi 原有主题，界面代码独立实现。

## 支持范围

- Android 8.0+，使用较新的系统 WebView（建议 123+）。系统文件选择器授权后离线读取，不申请整个存储空间权限，不需要联网。
- 图片目录、单图、ZIP/CBZ、RAR/CBR、7z/CB7、PDF、EPUB。RAR4、RAR5 和固实 7z 均可直接按页阅读，无需手动解压；暂不支持密码及多卷压缩包。
- 56px 顶栏与 60px 底部导航；搜索替换顶栏，统一匹配名称、标签、备注。目录树与书架分类从左侧打开，根目录和分类可长按排序，点击立即切换。右上角三点设置网格列数、列表封面大小与资源库排序。
- 网格点击卡片进入阅读；列表点击封面进详情、文字进阅读。元信息只保留页数与大小，收藏和详情按钮无边框；长按打开底部操作栏，选择后可多选，书架、收藏、书签可拖动排序。资源列表隐藏滚动条，紧凑间距与标题保留更多封面空间。
- 首页保留 Omi 标识，最近阅读为两列两行，底栏进入资源库／刷新／设置；移除插画、艺术字和底部小字。手机没有临时存放，外部文件保存到最近阅读。配色与圆角沿用 Omi 主题。
- 阅读区占满应用可用高度，轻点中央显示或收起工具栏，阅读设置放入可滚动面板。支持音量键翻页及反向设置，默认关闭；只有活动阅读界面且没有面板、输入焦点时接管，后台和返回书库后恢复系统按键。滑动、点两侧、全景拖动与惯性保持可用。
- 每本页面排序（自然升降序、修改时间升降序）、自动翻页与全景滚动可用。每次打开漫画适应窗口，窄屏可显示双页；进度实时切页，轨道左侧显示单／双页页数，右侧显示总页数，从右到左阅读时交换两端数字。播放在最右侧并与轨道居中，手动操作不关闭手机自动阅读，设置打开时临时停留。阅读底栏与顶栏同为 56px。全景拖动连续滚动，仅点击轨道播放跳转动画；图片漫画拖动时显示缩略预览，可滑动精调、点击选页，外部点击直接关闭。双指缩放、拖动与双击复位；画面调整全局保存、默认中性参数。图片和 PDF 支持锐化降噪；EPUB 支持基础调整和滤镜。具体边界见 [阅读工具](reader-tools.md)。
- 设置按外观、资源库、默认阅读、漫画阅读、性能、安全和关于分级；支持预览行宽、每页 50／100／150／200／500 项、预加载及缓存预算。全景音量键间隔默认为 1 页，可调为 0.25–2 页。搜索支持中英文逗号混合名称、标签和备注；系统返回先关闭搜索、预览、最上层菜单、选择状态，再返回页面。侧栏支持左右滑动，叠加弹窗保留侧栏；点击遮罩不触发底层内容。
- 连续资源库按实际显示列数定位，手机两列与横屏切换不会漏项；合集数量不统计图片页面，支持子资源封面、PDF 首页和 EPUB 声明封面。
- 本地可定位文件直接通过 SAF 文件描述符读取，ZIP/CBZ、RAR/CBR、7z/CB7、PDF、EPUB 不必先复制整本。只有流式文件提供程序需要私有缓存（单本最多 1 GB，总量 1.5 GB）；封面后台任务不会触发整本复制。单张图片压缩数据最多 64 MB，最大 1 亿像素，封面在解码前采样到最长边不超过 480 px。压缩包最多 30,000 个条目。
- ZIP/ZIP64 的 Stored、Deflate 由独立中央目录实现按偏移读取并校验 CRC；其他 ZIP 方法、RAR/7z 保留 libarchive-android 1.1.7 / libarchive 3.8.8 兼容通道。展开总量最多 8 GB。固实格式阅读与预览分别最多一个有状态解码器，每个压缩数据缓存最多 24 MB/12 页；索引最多 32 本且总条目超过 60,000 时淘汰旧项。固实包首次索引及向后跳页仍可能需要顺序解码，不会在漫画目录生成解压文件。
- 原生像素缓存受「阅读图片内存缓存」控制，设备上限取应用内存额度的三分之一，限制在 24–192 MB，再与用户预算取较小值；当前显示所需图片不被提前回收。设为 0 关闭相邻页预读。高清图块另受 4–24 MB 预算约束，画面调整后台处理。页面加载并发可设 1–4，当前页优先，后台预读最多 3 项。
- 阅读磁盘缓存默认总预算 512 MiB，可在「性能与缓存」设为 0–2048 MiB；0 关闭此缓存。PNG 清晰底图最多占总预算的一半且不超过 128 MiB，按文件身份失效并跨重启复用；余量用于临时原页。退出漫画后清理临时原页和流式复制副本，下次启动后台清理异常退出残留。阅读页面地址请求使用独立队列，不被进度保存或书库元数据请求阻塞；缓存预览不等待冷封面解码。清理不删除漫画、阅读记录或目录索引。
- 目录 URI 持久索引最多 32,000 项；目录列表保存最多 128 个，核对目录版本并限定 5 分钟有效期。重启后可按 URI 直达，首次读取目标文件时重新核对元数据；显式刷新和本地重命名/删除会使相关缓存失效。封面和压缩包索引按授权 URI、路径、大小、修改时间缓存到私有目录，默认封面 128 MB（可设 64–512 MB）/压缩包索引 16 MB，重启保留；提供程序没有修改时间时只在本次进程内复用。
- 文件夹封面取消 6 层截断，以每轮最多 8 个目录、约 60ms 的分段搜索续接位置；单个提供程序查询可能超过该预算。搜索最多访问 8192 个目录，检测重复 URI。前端合并重复请求、最多同时执行两项，离开页面取消无用任务；保存最多 512 个短期结果。原生封面队列与阅读分开，提供程序查询不持有阅读元数据锁。封面位置缓存上限 2 MB，跨重启保留，命中时核对目标文件；手动刷新与本地文件变更使缓存失效。磁盘缓存维护字节计数；超限时清到预算的 85%，留出空间，避免满缓存后每写入一页就扫描目录。
- 书库只注册惰性封面地址，图片进入可见范围才读取首张可用图片。新漫画页数在首次打开后记录，后台不为页数扫描整本；打开及阅读请求优先于排队的书库元数据请求。
- Omi 自适应图标适配不同桌面裁切；Android 13+ 支持主题单色图标。APK 包含 arm64-v8a、armeabi-v7a、x86_64 和 x86；64 位原生库与 APK 内未压缩原生库按 16 KB 对齐。
- EPUB 按章节阅读，移除脚本、远程内容、表单、SVG 与出版方样式。保留净化文本和位图。
- 原生消息端口只交给可信的主页面；EPUB 的 iframe 不含脚本权限，不暴露 JavaScript 文件接口。网页所有请求均被限制到本地资源。

## 数据与文件

目录访问采用 Android Storage Access Framework。授权及阅读记录持久保存，退出应用后可续读。权限被系统撤销时需要重新添加目录。

普通删除引用保留原文件。本地重命名会同步更新所有路径相关记录；本地删除必须在弹窗中单独选择，Android 不提供通用回收站，因此永久删除。根目录受到保护。修改文件前保留一份 `before-file-operation.json`，数据写入通过 Android AtomicFile 完成。

单文件选择器只授予该文件访问权，不自动取得父目录权限。要浏览完整图片目录，请从资源库添加目录。卸载会移除应用私有记录与缓存，不移除所选漫画目录。

## 构建

依赖：Node.js 24、JDK 17+、Android platform 35、build-tools 35.0.0。设置 `JAVA_HOME` 和 `ANDROID_SDK_ROOT` 后运行：

```powershell
npm ci
npm run dist:android
```

脚本使用 Android 官方 aapt、d8、zipalign、apksigner 编译和签名，不依赖 Android Studio 或 Gradle。当前仓库下载的 SDK 也可从 `.cache/android-tools` 使用。输出：`release/OmiComic-1.1.22-android.apk`。PNGJ 2.1.0 以固定 SHA-256 校验后编入 APK，许可证随包附带。

`android/dependencies.json` 固定 Maven Central 原生依赖版本和 SHA-256。构建会核验 AAR、原生 ELF 对齐，使用项目 7-Zip 以 ZIP Store 方式加入原生库，再执行 16 KB zipalign 和签名。不会将 Windows 7-Zip 或 RAR 工具打入 APK。

首次构建创建 `.android-signing/omicomic-release.jks` 和本地密码文件。必须备份整个 `.android-signing` 文件夹，以同一签名发布更新；这些文件已被 Git 忽略，不应上传到仓库。APK 包含 React、React DOM、Scheduler、PDF.js、core-js、libarchive 及其依赖、本地字体和解码器的许可证。Windows EXE 使用独立打包流程。

## 验证

手机布局和触控使用 `tests/mobile.spec.ts`、`tests/android-interaction.spec.ts` 验证；数据原子提交、并发写入、重启恢复、重命名回滚和 EPUB 净化使用 `tests/dom.android.test.tsx` 验证。签名工具验证 APK 的 v2 / v3 签名。

真实 APK 回归通过独立、同签名的 instrumentation 测试 APK，生产包不打开调试接口。在专用模拟器上执行：

```powershell
node tests/android/fixtures.cjs
.cache/android-tools/platform-tools/adb.exe -s emulator-5580 install -r release/OmiComic-1.1.22-android.apk
.cache/android-tools/platform-tools/adb.exe -s emulator-5580 push .cache/android-fixtures/. /sdcard/Download/OmiSmoke/
# 在 Omi 中通过系统选择器授权 Download/OmiSmoke，首次使用选择“添加目录”。
./scripts/test-android.ps1 -Mode smoke
./scripts/test-android.ps1 -Mode restore
./scripts/test-android.ps1 -Mode ui
# 将 tests/fixtures/android-archives 中七个归档推送到同一测试目录后：
./scripts/test-android.ps1 -Mode archives
./scripts/test-android.ps1 -Mode archive-restore
./scripts/test-android.ps1 -Mode interactions
./scripts/test-android.ps1 -Mode storage -ColdCache
# 生成 14 本、每本 64 页、总计约 1 GB 的性能样本：
node tests/android/performance-fixtures.cjs
.cache/android-tools/platform-tools/adb.exe -s emulator-5580 push .cache/android-performance/Performance /sdcard/Download/OmiSmoke/
./scripts/test-android.ps1 -Mode performance -ColdCache
./scripts/test-android.ps1 -Mode performance
```

测试会重命名或删除专门生成的示例文件，拒绝对非模拟器设备运行。重复执行前应使用新的测试目录或重新准备示例文件。`restore` 启动新应用进程，检查持久授权及首页续读。结果和截图在 `test-results/android-*`；本轮设备结果见 [验证记录](VERIFICATION.md)。

`interactions` 在实际 APK 中注入 Android 触摸事件，覆盖六种资源单击进入、详情按钮和页面预览，同时强制媒体查询返回精细指针。`storage` 用测试包内的管道文件提供程序验证非可定位文件只在用户打开时复制且能复用缓存。`performance` 比较封面并发加载时的前台阅读和重启缓存；测试包与生产包分离。

1.1.2 新增回归（依赖上述示例目录）：

```powershell
node tests/android/reader-tools-fixtures.cjs
.cache/android-tools/platform-tools/adb.exe -s emulator-5580 push -a .cache/android-update-fixtures/Update112 /sdcard/Download/OmiSmoke/
./scripts/test-android.ps1 -Mode reader-tools
./scripts/test-android.ps1 -Mode reader-tools-restore
node scripts/verify-android.cjs
```

`upgrade` 模式只读取应用数据与目录列表，可在旧版和新版安装后各执行一次，逐项比较记录是否一致。`reader-tools` 验证原生时间、书签定位、封面、实际系统触摸、自动阅读和处理结果；`reader-tools-restore` 在新进程中检查按本保存的设置与续读。APK 检查逐文件比较打包后的界面资源与 `dist-android` 构建内容。

实现依据：[Android ContentResolver 文件描述符接口](https://developer.android.com/reference/android/content/ContentResolver#openFileDescriptor(android.net.Uri,%20java.lang.String))。只读描述符可能是管道，因此实际检测可定位能力并保留缓存回退。

1.1.5 新增手机回归（先生成 `reader-tools-fixtures.cjs` 中的中性测试页）：

```powershell
node tests/android/mobile-fixtures.cjs
.cache/android-tools/platform-tools/adb.exe -s emulator-5580 push .cache/android-mobile-fixtures/Mobile113 /sdcard/Download/OmiSmoke/
./scripts/test-android.ps1 -Mode mobile-covers -ColdCache
./scripts/test-android.ps1 -Mode mobile
./scripts/test-android.ps1 -Mode mobile-restore
./scripts/test-android.ps1 -Mode mobile-actions
./scripts/test-android.ps1 -Mode mobile-polish
```

`mobile-covers` 验证 24 层目录、120 个无图片子目录后的封面、12 次重复访问及并行阅读；`mobile` 注入系统触摸和真正的音量 KeyEvent，检查网格／列表、分层返回、横竖屏与系统音量；`mobile-restore` 在新进程检查设置与封面位置缓存。`mobile-actions` 在专用模拟器建立收藏与分类测试数据，验证真实长按、多选、卡片与分类拖动排序，以及排序后返回和继续点击。

`mobile-polish` 验证 1.1.5 的搜索系统返回、左右侧栏手势、遮罩防穿透、书签封面与索引重命名、详情封面对齐、旧缩放覆盖、保留式预览、全景音量小步长累积和设置层级。

1.1.10 本轮回归（使用已有中性示例目录）：

```powershell
./scripts/test-android.ps1 -Mode mobile-motion
./scripts/test-android.ps1 -Mode theme-polish
./scripts/test-android.ps1 -Mode mobile-fixes
./scripts/test-android.ps1 -Mode mobile-fixes-restore
```

`mobile-motion` 使用系统触摸检查左右侧栏退出逐帧位置、复开目录零重读、延迟读取期间无文件名／加载浮层、右到左数字位置、播放图标对齐、普通与全景自动阅读持续及设置临时停留。`theme-polish` 检查四主题、预览透明度、动画层级与缓存设置。`mobile-fixes` 依赖 `mobile-fixes-fixtures.cjs` 生成的 `Fixes116` 目录，检查解码等待期间无空白帧、页码输入、标签简介与返回层级；紧接着运行 `mobile-fixes-restore` 检查进程重启后的目录索引。


1.1.11 连续手势与转场验证：`scripts/test-android.ps1 -Mode mobile-transitions`，在专用模拟器中执行。测试手指停留、反向拖回、首帧准备、页面节点复用及返回。

1.1.12 原生图片与 ZIP 随机读取验证：

```powershell
node tests/android/native-fixtures.cjs
# 需要 Pillow；生成 EXIF 八种方向的中性测试图：
python tests/android/native-exif-fixtures.py
.cache/android-tools/platform-tools/adb.exe -s emulator-5580 push .cache/android-native-fixtures/Native112 /sdcard/Download/OmiSmoke/
# zip-fast 同时检查超长路径和文件名总量限制；只向专用模拟器投放测试样本：
python tests/android/metadata-fixtures.py
.cache/android-tools/platform-tools/adb.exe -s emulator-5580 push .cache/android-metadata-fixtures/Metadata /sdcard/Download/OmiSmoke/
./scripts/test-android.ps1 -Mode native-reader
./scripts/test-android.ps1 -Mode native-speed -ColdCache
./scripts/test-android.ps1 -Mode zip-fast -ColdCache
# loading 使用上面的 performance 样本与归档样本：
./scripts/test-android.ps1 -Mode loading -ColdCache
./scripts/test-android.ps1 -Mode loading-restore
node scripts/verify-android.cjs
```

`native-reader` 检查原生绘制、单／双页、全景与自动阅读、RTL、EXIF、区域解码、画面调整、分层返回以及解码完成时的显示竞争。`native-speed` 不加入触摸辅助的固定等待，单独记录打开和缓存翻页时间。`loading` 实际阻塞保存，验证读取不等待保存完成。详细结果与计时口径见 [1.1.12 工作报告](verification-1.1.12.md)。

1.1.13 补充验证：`mobile-preview-speed` 使用真实 Android 触摸，在 2500 页压缩包中远距离拖动，比较正文与选中预览完成时间；`mobile-interactions1113` 验证首页点击、栏目方向、详情返回和打开路径。运行方法同上，替换 `-Mode`。

1.1.14 补充验证：运行 native-stability 检查 8000×10000 大图静止、12 类抗摩尔纹样本和磁盘副本；同一模式再次启动验证重启复用。mobile-preview-speed 现在验证选中预览实际绘制的原生图像身份，与正文一致。浏览器视觉检查见 tests/mobile1114.spec.ts。

1.1.38 首页进入资源库的首次转场验证（使用上述专用模拟器和 OmiSmoke 目录）：

```powershell
./scripts/test-android.ps1 -Mode mobile1138-entry -ExpectedVersion 1.1.38
./scripts/test-android.ps1 -Mode mobile1138-entry -ExpectedVersion 1.1.38 -Fixture night
./scripts/test-android.ps1 -Mode mobile1123-resume -ExpectedVersion 1.1.38 -Fixture home-short
./scripts/test-android.ps1 -Mode mobile1123-resume -ExpectedVersion 1.1.38 -Fixture reader-short
```

`mobile1138-entry` 在独立进程中依次测试首次进入、返回首页、再次进入，用实际窗口像素检查连续过渡和空白帧，并确认动画保持 280 ms、临时图层释放。另检查准备时取消、播放时暂停及迟到回调，保存首页图标截图并确认手机中心描边隐藏。`night` 通过实际设置界面切换夜色主题；`observe` 只采集旧包的对照数据，不执行新版断言。测试工具中的采样等待不属于产品动画时长。
