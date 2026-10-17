# OmiComic Android 1.1.16 工作报告

日期：2026-10-15。本轮修复快速远距离拖动后的下方预览空白，调整书架操作顺序，并验证超 1 GB 压缩包和全部已支持文件类型。

## 安装包

- [OmiComic-1.1.16-android.apk](../release/OmiComic-1.1.16-android.apk)，14,430,917 字节，约 14.43 MB。
- 包名 `io.github.lorcinv.omicomic`，versionCode `10116`，Android 8.0+，包含四种 ABI。
- 沿用原发布证书，直接覆盖安装保留记录，不要先卸载。
- SHA-256：`5405c5b95f6f87682b7b6b63c0f2facf105e375a756a933bf46be32ee98fd4c0`。[校验文件](../release/OmiComic-1.1.16-android.sha256)
- 签名证书 SHA-256：`31d30425848de4b32a69e27873756562f400996ef647cba83443b6b20ad9db43`。

已取回模拟器实际安装的 APK，核对与交付文件哈希一致。[安装证据](../test-results/mobile1116-install.json) · [打包内容检查](../test-results/mobile1116-apk-verify.json)

## 预览空白的原因与修复

用户反馈的是约 382.4 MB、200 页压缩包快速拖动后，下方预览空白，正文正常。本轮使用生成的 349,335,427 字节（333.2 MiB）、200 页 JPEG 压缩包，复现了其中一个直接原因；没有使用用户原始压缩包。

**原因一：界面还记着图片地址，但原生缓存里的图片已经被回收。** 连续跳到远处后，正文位图和预览小图会按预算淘汰旧内容。旧版前端仍认为该地址“加载完成”，原生预览发现没有图片时直接跳过，两端都不再补载。正文有自己的恢复流程，所以会出现“正文正常、只有预览空白”。

旧版实测：访问多个远处页面后回到第 25 页，五张可见预览中，第 23 页地址仍在、图片却持续缺失，等待超过 12 秒仍不恢复。[旧版失败记录](../.cache/mobile-1116-baseline/preview-cache-miss.json)

现在原生层会检查真正缺失的可见预览，将补载任务放在正文与相邻预读之后；复用已有解码、请求合并和取消机制。跳页、换书、退出阅读会使旧补载失效，不会把旧图覆盖到新页。没有扩大正文、磁盘或小图缓存预算。

**原因二：预览条过早认定滚动停止。** 原逻辑在 160 ms 没有滚动后停止跟随；大文件解码造成慢帧时，惯性滚动可能稍后继续，界面却忽略了事件。程序定位预览条的临时屏蔽标记还可能因动画帧被取消而无法恢复。

现在每次实际滚动都会更新可见窗口，只忽略与程序定位位置一致的那次事件。延迟惯性、被打断的程序定位都有回归测试，两项在修改前失败、修改后通过。正文共用预览、相邻页优先、过期读页取消和静态选中框继续保留。

最终 APK 执行 6 次远距离访问与回访、16 次连续快速拖动、8 次预览条双向甩动，停下后所有可见预览均恢复。回到原先失败位置时，原生层实际补载了缺失图片。关闭正文预读、正文缓存设为 0 的同一套操作也通过。[默认配置](../test-results/android-mobile1116-seek-default.json) · [关闭正文预读](../test-results/android-mobile1116-seek-no-preload.json)

## 书架操作

书架内漫画长按后，「打开路径」位于右侧整理操作的最下面；多选时也在最后，选中多个资源时继续禁用。最近阅读的入口位置不变。跳转仍使用资源库自己的卡片显示设置。

## 超过 1 GB 的压缩包

测试使用实际 JPEG 数据，没有添加无关内容填充体积。两份文件均为 200 页，每页 3200 × 4500；12 种生成图案循环构成页面，普通 ZIP 分别对每个条目存储或压缩。

| 样本 / 状态 | 实际字节数 | 点击后检测到首张原生画面 | 8 次跨页后可见预览就绪中位数 |
| --- | ---: | ---: | ---: |
| Stored CBZ，冷阅读缓存 | 1,185,028,638（1.104 GiB） | 831 ms | 1,441 ms |
| 同一 CBZ，跨进程复开 | 同上 | 495 ms | 1,251 ms |
| Deflate ZIP，冷阅读缓存 | 1,173,696,698（1.093 GiB） | 986 ms | 1,672 ms |

每轮检查首屏、最后一页、中间页及多次远距离跳转，核对实际原生图片身份和尺寸，并等待可见预览全部绘制。结果全部通过。两种本地压缩包的整包复制量均为 **0 字节**，按需读取页面；复开沿用索引，Stored 包有 62 次页面磁盘缓存命中。

测试设置正文内存预算为 100 MiB，模拟器根据设备内存收紧至 64 MiB。跨页检查中完整位图最多 64,800,000 字节（61.8 MiB），预览小图最多 4,085,760 字节（3.9 MiB），均在各自预算内。阅读页面磁盘预算仍为 512 MiB；三轮结束分别使用约 395.5、429.4、299.5 MiB。停稳后的额外位图解码次数为 0，没有持续补载循环。这里统计的是各级缓存，不能理解成整个应用进程的内存上限。

冷缓存轮清除阅读、封面与压缩包缓存，保留目录授权与目录索引；操作系统文件缓存未强制清除。首屏计时从真实触摸抬起开始，跨页计时从测试工具完成拖动开始，原生状态轮询约有 100 ms 粒度。以上为同一模拟器的观察值，不是所有手机的速度保证。

[Stored 冷缓存](../test-results/android-mobile1116-large-cold.json) · [Stored 跨进程复开](../test-results/android-mobile1116-large-warm.json) · [Deflate 冷缓存](../test-results/android-mobile1116-deflate-cold.json)

**兼容性边界：** 本地可随机读取的文件没有套用流式缓存的 1 GiB 限制；不能随机读取的云盘／流式文件提供程序，仍需先缓存整本，单本上限为 1 GiB、累计预算 1.5 GiB。大于该上限会提示先移至手机本地目录。单张图片文件 64 MiB、归档 30,000 条目、展开总量 8 GiB 等既有边界没有放宽。本轮超过 1 GiB 的实际文件测试覆盖 Stored/Deflate ZIP；RAR/7z 的普通样本与固实结构另行验证，不能据此推断所有超大固实包都有相同速度。

测试流式提供程序声明一个 2 GiB 文件时，应用在缓存前拒绝并给出上述本地目录提示；另一个 48,595 字节的实际流式 RAR 只缓存一次，复开可以继续读取。这验证的是流式边界与描述符生命周期，没有连接真实云盘。[流式读取记录](../test-results/mobile1116-storage.json)

## 全部支持类型的打开检查

使用实际安装包逐项打开、核对可见内容、翻页并退出；压缩图片还执行乱序读页和像素校验。单图入口验证定位到所在目录对应页。共 17 个格式／入口场景全部通过。

| 类型 | 检查内容 | 结果 |
| --- | --- | --- |
| 图片文件夹 | 混合六种图片格式，打开与翻页 | 通过 |
| JPG、JPEG、PNG、WebP、BMP、GIF | 六种单图入口、对应页定位、解码与翻页 | 全部通过 |
| ZIP / CBZ | Stored、Deflate、LZMA、Bzip2；Unicode 路径、乱序取图、界面翻页 | 全部通过 |
| RAR / CBR | RAR4、固实 RAR5，乱序取图与界面翻页 | 全部通过 |
| 7z / CB7 | 非固实与固实 7z，乱序取图与界面翻页 | 全部通过 |
| PDF | 实际画布已绘制，第一页与第二页切换 | 通过 |
| EPUB | 章节文字、内嵌位图、第二章切换，脚本不执行 | 通过 |

加密 7z、损坏 RAR、空 7z 均返回明确错误。[逐格式记录](../test-results/android-mobile1116-formats.json)

另行通过 ZIP64、Unicode 路径和 2500 页 CBZ 的随机读页，并确认加密 ZIP、截断 ZIP 与 CRC 损坏会被拒绝。[ZIP 边界记录](../test-results/mobile1116-zip-fast.json)

格式检查曾因测试要求 EPUB 插图必须维持原图 800 像素宽而报错；截图与代码核对确认应用按现有逻辑输出了可读的缩图。修正为检查实际解码、正确比例和章节内容后全套重跑通过，未为此修改 EPUB 产品代码。

## 既有修复的回归结果

| 检查 | 最终结果 |
| --- | --- |
| 类型检查、Android 生产构建与签名 | 通过；v2/v3 原证书，四种 ABI，16 KB 对齐，APK 渲染资源与构建一致 |
| 组件回归 | 11 个文件、71 项通过，包含两项新增滚动回归 |
| 浏览器回归 | 35 项通过，包含首页命中、阅读完成后排序、独立显示设置、静态预览样式、手机转场及 PC 阅读／详情 |
| Android 实际 APK | 15 组运行通过：两种预览配置、三轮超大文件、格式矩阵及九组既有回归 |
| 书架路径与长按 | 「打开路径」最后一项；资源库列表与书架网格互不影响；普通文字无选区，详情文件名可系统复制 |
| 预览同步与关闭 | 当前预览与正文使用同一图像；6 次真实跨页操作均在同次检查中已绘制；关闭预览不穿透到设置，返回顺序正确 |
| 原生阅读 | 单双页、左右方向、自动阅读、全景、缩放、EXIF、反色、快速退出重开通过 |
| 大图稳定性 | 静置新增解码 0 次、重绘 0 次，8 次像素采样变化 0 次；缩图与 PNG 图块参考比对通过 |
| 缓存与跨进程恢复 | 降低容量后生效，180 次缓存写入受预算约束；重启后的 ZIP／固实 RAR／7z 共 9 页均命中磁盘缓存，重复解压与索引重建均为 0 次 |

原始记录：[首页](../test-results/mobile1116-mobile1115-home.json)、[设置与路径](../test-results/mobile1116-mobile1115-features.json)、[预览同步](../test-results/mobile1116-mobile-preview-speed.json)、[原生阅读](../test-results/mobile1116-native-reader.json)、[大图稳定性](../test-results/mobile1116-native-stability.json)、[缓存预算](../test-results/mobile1116-loading.json)、[跨进程恢复](../test-results/mobile1116-loading-restore.json)。

## 验证环境与交付范围

使用专用 Android 15 x86_64 模拟器、系统 WebView 124 和生成的隔离样本；未连接实体手机。Windows 成品仍为 1.1.10，本轮未重新打包。源码、APK 与报告在本地，未提交或上传 GitHub。

本轮开始前保存了 376 个源码／配置文件快照及原 1.1.15 APK，位于 `.cache/mobile-1116-baseline/`。原 1.1.15 安装包已恢复，原校验值继续有效。

逐文件核对没有原文件丢失，实际产品代码仅修改预览组件、原生阅读预览恢复和书架操作顺序三个文件；桌面服务未改动。其余为版本、说明、样本生成和测试文件。[范围核对](../test-results/mobile1116-scope.json)

## 复现入口

```powershell
npm run test:dom
npx playwright test tests/mobile1115.spec.ts tests/mobile-previews.spec.ts tests/mobile-transitions.spec.ts tests/mobile-interactions1113.spec.ts tests/mobile1114.spec.ts tests/reader-layout.spec.ts tests/reader-rework.spec.ts
node scripts/verify-android.cjs
# 以下仅用于已授权隔离样本目录的专用模拟器。
./scripts/test-android.ps1 -Mode mobile1116-seek -JavaHome <JDK路径> -ColdCache
./scripts/test-android.ps1 -Mode mobile1116-seek -Fixture no-preload -JavaHome <JDK路径>
./scripts/test-android.ps1 -Mode mobile1116-large -JavaHome <JDK路径> -ColdCache
./scripts/test-android.ps1 -Mode mobile1116-large -JavaHome <JDK路径>
./scripts/test-android.ps1 -Mode mobile1116-large -Fixture LargeDeflateOver1GiB.zip -JavaHome <JDK路径> -ColdCache
./scripts/test-android.ps1 -Mode mobile1116-formats -JavaHome <JDK路径> -ColdCache
```

样本生成入口为 `tests/android/mobile-seek-fixtures.py` 和 `tests/android/mobile1116-fixtures.py`；前者用 `--over-gib` 生成超大 Stored CBZ，再加 `--deflate` 生成超大 Deflate ZIP。Python 需要 Pillow 与 NumPy。样本不包含在发行 APK 中。
