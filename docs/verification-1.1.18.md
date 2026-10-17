# OmiComic Android 1.1.18 工作报告

日期：2026-10-16。此次优化针对大 PNG 漫画连续翻页：先显示当前页，后台准备阅读方向附近的清晰页面，复用仍有用的任务，并把底图保存延后到阅读停稳后。沿用既有内存、磁盘上限和退出清理，不把整本漫画展开成常驻像素。

## 安装包

- [OmiComic-1.1.18-android.apk](../release/OmiComic-1.1.18-android.apk)，14,447,301 字节，约 14.45 MB。
- 包名 `io.github.lorcinv.omicomic`，versionCode `10118`，Android 8.0+，包含 arm64-v8a、armeabi-v7a、x86_64、x86。
- 沿用原发布证书，可覆盖安装并保留原有记录；不要先卸载。
- SHA-256：`76345f95872998200f029640736d5bd8cd937c24f5a22f27983b91a80e50d146`。[校验文件](../release/OmiComic-1.1.18-android.sha256)
- 签名证书 SHA-256：`31d30425848de4b32a69e27873756562f400996ef647cba83443b6b20ad9db43`。

已完成类型检查、前端生产构建、Android SDK 编译、v2/v3 签名、16 KB 对齐和资源检查。最终 APK 已覆盖安装到模拟器，并取回实际安装文件核对 SHA-256；本报告的新版本原生回归均对应上述最终哈希。项目使用既有 Android SDK 构建脚本，没有将此过程记作 Gradle 构建。

[安装证据](../test-results/mobile1118-install.json) · [APK 检查](../test-results/mobile1118-apk-verify.json) · [结果汇总](../test-results/mobile1118-summary.json)

## 本次改动

1. **预读沿翻页方向分配。** 默认预加载范围为 2 时，优先安排前方 3 页、后方 1 页；最近的前后邻页先准备，再补前方页面。数量同时受用户内存预算、单页预计像素量和书本边界限制。双页模式按当前页组计算，关闭内存缓存或预读时不会偷偷启动相邻页预读。
2. **正常翻页保留有用任务。** 新旧预读范围重叠的读取、解码继续完成，减少“刚开始准备下一页，又因翻页被取消重做”。远距离跳页仍取消无关工作；会话与显示帧校验继续防止旧页覆盖当前页。
3. **预读以清晰图完成为准。** 大 PNG 的低清占位不再算作后台预读完成。当前页先显示，确认当前页组已准备后再安排邻页。单线程设置采用异步接续，避免等待同一线程上的补清晰任务而卡死。
4. **读图与保存错开。** 快速翻页期间推迟 PNG 清晰底图编码；导航停稳至少 600 ms、读图队列空闲后再保存，优先当前可见页。待写队列最多两项、只有一个写入线程，并弱引用位图，淘汰的页面不会被队列长时间占住。已在内存中的清晰页也可补存，已有磁盘底图不重复编码。
5. **预览跟随实际预读范围。** 下方预览条只等待确实被安排的原生邻页，范围外使用独立缩略图；后台预读失败时也能回退。解决方向性预读引入的“预览等待一个没有安排的页面”问题，保留原有静态选中边框。

当前 ZIP/ZIP64 仍直接定位所需条目。RAR/7z 沿用现有有状态读取通道，由邻页窗口逐步准备；没有加入整本解压后常驻内存的步骤。普通 PNG 的抗摩尔纹解码、放大时的按需高清图块保持原逻辑。

## 内存和空间

| 内容 | 本版策略 |
| --- | --- |
| 正文像素缓存 | 用户默认 100 MiB，实际还取设备限制；本轮模拟器有效上限 64 MiB |
| 原生预览小图 | 原有 4 MiB 上限 |
| 临时原始页面磁盘缓存 | 默认 384 MiB，退出漫画后后台清理 |
| PNG 清晰底图与尺寸信息 | 默认最多 128 MiB，限额保留并淘汰旧项 |
| 阅读磁盘缓存总预算 | 默认仍为 512 MiB；底图最多占总预算一半且不超过 128 MiB |
| 目录索引、封面资料、阅读记录 | 沿用原管理逻辑，不因退出漫画而删除 |

3444×5120 图片在本轮适应屏幕时使用 861×1280 清晰底图，像素约 4.2 MiB；放大后再补可见区域。此前估算的约 7.2 GiB 是 110 张全分辨率 RGBA 同时展开的大小，本方案不会这样分配。

上述正文预算不是整个 Android 进程的内存上限；原图读取缓冲、图块、界面等另有开销。退出后清空原生正文、预览和图块引用，不将计数归零解释为系统进程内存立即归零。

## 超大 PNG 对照结果

样本为 **1,916,865,148 字节（约 1.92 GB / 1.79 GiB）、110 页、3444×5120 PNG** 的 Stored CBZ。五种生成图像循环组成 110 页，单页约 11.2–22.3 MB，包含普通 RGB、色彩配置、索引色透明等情况；全部为真实图像数据，没有填充凑体积。[样本生成器](../tests/android/mobile1117-fixtures.py)

旧版 1.1.17 和本版使用同一模拟器、同一文件与同一计时步骤。两版均清除阅读缓存，提前查询相同的页面地址；这是调度对照，不能把其打开时间与下面的实际卡片冷打开混为一组。

| 对照项目 | 1.1.17 | 1.1.18 |
| --- | ---: | ---: |
| 连续快速翻 4 页至目标页清晰，三组中位数 | 1446 ms | **1271 ms，减少约 12.1%** |
| 按节奏逐页翻，10 次中位数 | 519 ms | 503 ms |
| 回翻，5 次中位数 | 500 ms | 502 ms |
| 原生正文像素缓存峰值 | 66,124,800 字节 | 66,124,800 字节 |
| 本段取消计数 | 21 | 0 |

本版复用了 13 次仍在窗口内的任务，完成 25 次清晰预读。单线程设置另跑一轮，连续翻页、反向阅读、退出时仍有任务在执行等检查全部通过，没有出现互相等待。对照段回翻速度基本持平，正文像素峰值没有提高。

[1.1.17 对照](../test-results/mobile1118-baseline-prefetch.json) · [1.1.18 对照](../test-results/mobile1118-prefetch.json) · [单线程](../test-results/mobile1118-prefetch-single.json) · [计时脚本](../tests/android/mobile1118-prefetch.js)

实际从卡片打开与缓存恢复另行测试：

| 本版测试条件 | 清晰首屏 | 连续翻页清晰中位数 | 本轮退出后立即重开 |
| --- | ---: | ---: | ---: |
| 冷阅读缓存，默认预读 | 1020 ms | 404 ms（8 次） | 468 ms |
| 新进程，保留清晰底图 | 610 ms | 404.5 ms（8 次） | 219 ms |
| 冷阅读缓存，关闭预读 | 686 ms | 497 ms（8 次） | 527 ms |

冷缓存轮六次远距离拖动后，正文与可见预览均恢复，包括最后一页。故意留下“已取消补载的低清图”后，当前页在 464 ms 内补清晰；注入两次真实读取失败后也能恢复。这些故障注入只存在于独立测试 APK，发行包没有测试入口。

70 次连续翻页压力轮，退出前临时原页 **377,566,777 字节（360.1 MiB）**，退出后 **0 字节**；清晰底图 **46,749,714 字节（44.6 MiB）** 保留。缓存采样均未超预算，退出后的正文、预览、图块计数归零；额外检查退出后不会被迟到的任务重新填回。各超大 PNG 场景整包复制量均为 0 字节。

测试在页面停稳后核对当前清晰底图确实落盘，再验证退出及复开，避免把“已排队保存”当成“已保存”。静止时没有持续解码循环。

[冷缓存](../test-results/mobile1118-png-cold.json) · [跨进程复开](../test-results/mobile1118-png-restore.json) · [关闭预读](../test-results/mobile1118-png-no-preload.json) · [70 次翻页](../test-results/mobile1118-png-stress.json)

## 格式和旧功能回归

最终 APK 完成 20 组原生场景检查。格式组实际打开并翻页验证 17 个目标：图片目录、JPG、JPEG、PNG、WebP、BMP、GIF、Stored ZIP、Deflate CBZ、LZMA ZIP、BZIP2 ZIP、RAR4、RAR5 CBR、7z、固实 CB7、PDF、EPUB。加密、损坏、空包样本正确返回错误；PDF/EPUB 返回退出时也清理会话临时文件。

超过 1 GiB 的额外样本为 200 页、3200×4500 JPEG。两种压缩方式均通过冷缓存卡片打开、八次远距离跳页、最后一页、预览恢复、缓存预算与静止不重试检查，整包复制量均为 0 字节。

| 样本 | 压缩包字节数 | 清晰首屏 | 八次跳页中正文及可见预览全部恢复的最长时间 |
| --- | ---: | ---: | ---: |
| Stored CBZ | 1,185,028,638 | 671 ms | 1439 ms |
| Deflate ZIP | 1,173,696,698 | 933 ms | 1816 ms |

[格式记录](../test-results/mobile1118-mobile1116-formats.json) · [超 1 GiB Stored](../test-results/mobile1118-mobile1116-large.json) · [超 1 GiB Deflate](../test-results/mobile1118-mobile1116-large-deflate.json)

| 回归范围 | 结果与证据 |
| --- | --- |
| 首页第一排误触、最近阅读进入后更新 | 通过；[首页记录](../test-results/mobile1118-mobile1115-home.json)及界面测试 |
| 各栏目独立显示设置、路径跳转、书架打开路径位于底部、文字选择边界 | 通过；[功能记录](../test-results/mobile1118-mobile1115-features.json)及组件测试 |
| 大文件快速拖动、缓存淘汰后预览恢复、关闭预读 | 通过；[拖动](../test-results/mobile1118-mobile1116-seek.json)、[零预读](../test-results/mobile1118-mobile1116-seek-zero.json) |
| 预览复用、仅静态选中框 | 通过；[预览记录](../test-results/mobile1118-mobile-preview-speed.json)及界面测试 |
| PNG/JPEG 抗摩尔纹与静止稳定 | 13 个图案通过；8 次像素采样未变，静止新增解码与绘制均为 0；[记录](../test-results/mobile1118-native-stability.json) |
| 原生阅读、放大、图块、方向与缓存 | 通过；[原生阅读](../test-results/mobile1118-native-reader.json) |
| 页面加载、进程恢复、ZIP 快速读取、流式来源边界 | 通过；[加载](../test-results/mobile1118-loading.json)、[恢复](../test-results/mobile1118-loading-restore.json)、[ZIP](../test-results/mobile1118-zip-fast.json)、[存储](../test-results/mobile1118-storage.json) |
| TypeScript 类型检查 | 通过 |
| 组件测试 | 74/74，通过 11 个测试文件，新增两项预览回退回归 |
| 浏览器界面回归 | 35/35，覆盖手机交互、预览、转场及既有阅读布局 |
| 阅读布局和预读窗口单元测试 | 6/6，覆盖方向、预算、双页、边界和关闭预读 |

## 交付与复查

本轮修改前保留了源码副本、文件哈希和 Git 状态，位置为 `.cache/mobile1118-baseline/`。改动清单按这些副本比较，不把之前尚未提交的修改算成本轮新增；详见 [范围核对](../test-results/mobile1118-scope.json)。1.1.17 安装包保留且哈希未变。本次为本地 Android 交付，Windows 成品保持原版本，未推送或发布到 GitHub。

主要复查入口：

```powershell
npm run typecheck
npm run test:dom
node --test src/reader/preloadWindow.test.cjs src/reader/layout.test.cjs
node scripts/verify-android.cjs
./scripts/test-android.ps1 -Mode mobile1118-prefetch -ExpectedVersion 1.1.18 -JavaHome <JDK路径> -ColdCache
./scripts/test-android.ps1 -Mode mobile1118-prefetch -Fixture single-worker -ExpectedVersion 1.1.18 -JavaHome <JDK路径> -ColdCache
./scripts/test-android.ps1 -Mode mobile1117-png -ExpectedVersion 1.1.18 -JavaHome <JDK路径> -ColdCache
```

需要先按既有测试流程准备专用模拟器、目录授权和生成样本，完整模式及参数见 [Android 测试入口](../scripts/test-android.ps1)。构建入口为 `npm run dist:android`，本地使用原发布密钥。

本轮设备为 Android 15 x86_64 模拟器、WebView 124。计时包含真实 Android 按键注入和约 100 ms 状态检查粒度；冷缓存没有清空操作系统文件缓存。这些数字反映该环境的单轮对照，不代表实体手机帧率。未取得用户原来的 1.8 GB 文件，也未进行 ComicScreen 同机速度对照。远距离跳到尚未准备的页面仍需要读取和解码；本次减少等待和重复工作，不承诺任意速度翻页都没有等待。
