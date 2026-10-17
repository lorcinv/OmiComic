# OmiComic 1.1.4 验证记录

日期：2026-10-13。Windows x64 免安装版与 Android 同签名 APK；本地交付，未上传 GitHub。Android 版本码 10104。

## 本轮实现

| 范围 | 最终行为 |
| --- | --- |
| 手机首页 | Omi 图标与文字、两列两行最近阅读、资源库／刷新／设置底栏；移除插画、艺术字、底部小字、临时存放入口，外部文件保存到历史 |
| 目录与书架 | 目录树及分类左侧抽屉，名称立即切换、箭头折叠层级；根目录和分类长按调整顺序，进入后恢复到当前层级；分类和书架创建按钮在抽屉底部 |
| 搜索与显示选项 | 搜索替换顶栏，名称／标签／备注统一匹配，支持组合词、排除和限定字段；三点底部面板设置网格列数、列表封面尺寸及资源库默认排序 |
| 卡片 | 紧凑网格／列表，页数与大小、无边框收藏／详情；列表封面进详情、文字进阅读，网格整体进阅读；合集隐藏收藏和详情入口 |
| 整理 | 长按底部操作栏，按视图提供重命名、详情、书架、删除与选择；书架内容／收藏／书签可置顶、拖动排序，多选再次点击选择或按返回退出 |
| 设置与详情 | 分级设置、精简手机无用选项；详情使用紧凑封面与信息布局、独立滚动缩略图和底部文件操作，保持 Omi 主题 |
| 手机阅读 | 无顶部返回和上一页／下一页按钮；书签与三点无边框；播放在进度条右侧，浮层固定显示 x/y 或 x~z/y；实时拖动、双页、双指缩放、拖动、双击复位，画面调整全局保存 |
| PC 阅读与详情 | 默认适应窗口、实时进度拖动、单／双页数字浮层及 1.5 秒隐藏；Ctrl＋滚轮缩放、左键平移和重置；详情返回在左、重命名／删除在右，标签管理只滚动全部标签 |
| 加载 | 共享封面请求、两项并发、有界缓存、离开视图取消任务；目录元数据短期复用、跨重启封面位置与归档索引；缓存写入不再每次遍历全部文件 |

新默认值为适应窗口；升级保留用户已有的缩放偏好与按本阅读状态。资源库默认排序不覆盖书架的手动顺序。

## 已执行检查

| 检查 | 结果与证据 |
| --- | --- |
| 类型检查、PC／Android 生产构建 | 通过；生成 1.1.4 成品 |
| 核心服务与算法 | 85 项：84 通过，1 项因 Windows 不支持星号文件名而跳过；`.cache/unit-114-final.log` |
| DOM | 35 项通过，包括封面请求合并、订阅取消、文件版本变化、搜索、数据原子提交；`.cache/dom-114-final.log` |
| 浏览器界面 | 全量 90 项首轮 89 通过；剩余大图处理用例补充响应式切换完成等待与开发服务器首次加载等待后单独通过。业务实现未为此改动；`.cache/ui-all-114-final.log`、`.cache/ui-worker-114-final.log` |
| Windows 实际 ZIP | 解压交付 ZIP，运行其中 EXE；PNG／CBZ／CB7／PDF／EPUB、续读与重启、双页及极宽／极高图、画面处理、连续列表、大封面和三种主题删除窗口全部通过；`test-results/portable-smoke.json` 及相关 `*-smoke.json` |
| Android 实际 APK | Android 15 x86_64、WebView 124；真实触摸、音量键及反向、播放、横竖屏、设置、详情、分层返回通过；`test-results/android-mobile.json` |
| Android 长按与排序 | 注入带手指类型的原生触摸，长按、多选、卡片／分类排序、返回退出选择、排序后继续导航通过；`test-results/android-mobile-actions.json` |
| Android 重启 | 设置和目录授权保留，封面解码成功；深层封面搜索步数 0，归档索引重建 0；`test-results/android-mobile-restore.json` |
| 归档与存储 | RAR4／RAR5／7z／固实包随机页读取、真实阅读翻页、重命名、错误归档拒绝通过；流式提供程序仅在打开时复制一次，重开复用；`test-results/android-archives.json`、`android-storage.json` |
| 覆盖升级 | 从 1.1.3 使用原签名覆盖到 1.1.4，资源库、进度、历史、收藏、书签、分类、书架、元信息、目录文件及原设置均保留；`test-results/android-upgrade-1.1.4-comparison.json` |
| APK 内容 | v2／v3 签名、四种 CPU 架构、16 KB 原生库对齐、许可证通过；211 个界面文件与当前构建逐文件一致，无密钥或测试资源；`.cache/verify-apk-114-final.log` |

浏览器测试使用真实前端和测试文件接口；Android 使用实际签名 APK 与独立测试 APK；Windows 使用隔离数据运行从 ZIP 解压的真实 EXE。没有连接实体手机。

## 加载测量

以下为本机 Android 模拟器的记录，不代表所有手机和文件提供程序。首次目录读取与打开漫画后的首图时间分开统计。

| 场景 | 结果 |
| --- | --- |
| 24 层目录封面 | 首次 602 ms，4 轮分段查找；同次进程再次请求 26 ms |
| 120 个空目录后再进入 12 层 | 首次 853 ms，17 轮；再次请求 7 ms |
| 重复访问同一目录 12 次 | 每次 5–16 ms，封面全部复用，没有重新进入待扫描状态 |
| 深层封面并发时前台阅读 | 12 页示例首图实际解码 135 ms，整本复制字节数 0 |
| 14 本、1,058,228,907 字节、每本 64 页，清空派生缓存 | 目录读取 2754 ms；打开目标书到首图 487 ms，所有封面完成 593 ms；实际打开的三本产生 3 次阅读索引构建，封面索引构建 0，整本复制 0 |
| 同一负载重启后复用 | 目录读取 2488 ms；打开到首图 387 ms；阅读／封面索引重建均为 0，整本复制 0；固实 RAR／7z 再次打开分别 17／22 ms |

测量文件：`test-results/android-mobile-covers.json`、`android-performance-1.1.4-cold.json`、`android-performance-1.1.4-warm.json`。重启封面测试确认位置缓存命中且搜索步数为 0；其 4550 ms 还包含本次 WebView 启动与图片解码，不与同进程的封面请求耗时直接比较。

## 成品

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| `release/OmiComic-1.1.4-android.apk` | 14315977 | `c9788ddbc7e83e18fa0768da2d48efc0e5630d1281651c47523a0f426f5f6b56` |
| `release/OmiComic-Portable-1.1.4-x64.zip` | 140617885 | `f9a0b796b708294ab526e842eb35effbfff9345c33f1b55e86cfb7b685a5085a` |

Android 直接覆盖安装，不要先卸载；Windows ZIP 完整解压后启动。旧版本产物保留。没有执行 Git 提交、推送或发布。

## 复验入口

`npm test`、`npm run test:dom`、`npx playwright test`、`npm run dist:portable`、`node --test tests/portable.electron.cjs`、`npm run dist:android`、`node scripts/verify-android.cjs`。

实际 APK 用 `scripts/test-android.ps1` 的 `mobile-covers`、`mobile`、`mobile-restore`、`mobile-actions`、`archives`、`storage`、`performance` 模式；仅对专用模拟器的中性测试文件执行。覆盖升级比较使用只读 `upgrade` 模式。目录、文件提供程序、密码／多卷归档及 EPUB 的既有限制见 [Android 文档](ANDROID.md)。
