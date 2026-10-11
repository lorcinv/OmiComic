# Windows 1.1.1 验证记录

日期：2026-10-11。交付 Windows x64 ZIP 免安装版，Android 保持 1.0.1。[前版验证记录](verification-1.1.0.md)保留原有阅读工具、算法和性能说明。

## 本轮改动

- 页面排序、翻页间隔、滚动速度统一放在左下角「设置 → 阅读器」，移除顶部设置齿轮；顶部保留画面调整和播放 / 暂停。
- 总设置优先选择详情页漫画，否则选择最近阅读的漫画，并可切换其他已读漫画。配置仍按每本保存，重排保留当前图片、书签和续读，同步详情缩略图顺序。
- 详情页重命名、删除移至底部左侧，与右侧返回对齐并共用圆角磨砂按钮样式；文件操作前保存信息编辑。
- 添加标签跟在最后一个标签后，自然换行，统一颜色、尺寸和圆角。

## 实际验证

| 项目 | 结果 |
| --- | --- |
| 类型检查、生产构建、ZIP 打包 | 通过；实际 EXE 版本 1.1.1 |
| 核心服务和算法 | 80 项：79 通过，1 项因 Windows 文件名不支持星号而跳过 |
| DOM | 17 项通过 |
| 完整浏览器界面回归 | 75 项全部通过；真实前端、浏览器和图像 worker，文件接口使用测试替身 |
| 总设置 | 顶部齿轮移除；每本选择、四种排序、自动阅读参数保存、重开恢复及不同书籍互不影响通过 |
| 定位与原功能 | 图片标识、书签、续读、缩略图选择、双页、末页、自动翻页 / 滚动及暂停条件回归通过 |
| 详情布局与交互 | 1440、960 宽度下三按钮同高同排，返回与文件操作使用相同表面；标签按钮是最后一项，可添加标签；重命名、删除对话框正常打开，删除仍默认仅移除索引 |
| 截图检查 | 检查实际渲染的总设置窗口和详情页，按钮在底部左右两侧，添加标签紧跟标签列表 |
| 最终 ZIP 运行 | 完整性检查、36 个归档项；从含中文的独立临时目录解压并运行同一份 EXE，未使用旧安装程序 |
| 实际 EXE 新入口 | 从阅读器返回总设置修改排序，再进入同一本，图片与页码正确；关闭程序后重新启动恢复位置和画面参数 |
| 实际 EXE 多格式 | 真实图片文件夹、CBZ、CB7、RAR5 CBR 四种排序与书签映射通过；PDF / EPUB 在总设置保持原顺序；图片与 PDF 的处理 worker 正常 |
| 实际 EXE 原布局 | 窗口 / 宽高缩放、超宽图、双页和全景独立缩放回归通过 |
| 数据与发行包 | 原始测试图片哈希不变；ZIP / ASAR 不含用户漫画、阅读记录、签名私钥或测试目录 |

命令：`npm run verify`、`npx playwright test`、`npm run dist:portable`、`node --test tests/portable.electron.cjs`。线上 Verify reader and library 工作流进行干净依赖安装与完整回归；Windows EXE 运行检查为本地执行。

证据：`test-results/general-reader-settings.png`、`detail-actions-1440.png`、`detail-actions-960.png`、`reader-tools-smoke.json`、`reader-layout-smoke.json`、`packaged-smoke.json`、`portable-smoke.json`。

## 交付与限制

- `OmiComic-Portable-1.1.1-x64.zip`：140598949 字节，SHA-256 `79ed81113b2bc3ec049e4ce817a2d9c4c51c6d014fc33c4d97ee6c01e00deb8a`。
- 校验文件：`SHA256SUMS-1.1.1.txt`；7-Zip 对应源码随发布附件提供。
- Windows 未签名，记录继续保存在本机 `%APPDATA%\OmiComic\omicomic-data.json`。
- 本轮未重打 Android APK，未宣称 Android 真机验证。原有格式和处理预览限制见 [功能说明](reader-tools.md)。
