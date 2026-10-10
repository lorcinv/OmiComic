# 0.2.0 验证记录

验证日期：2026-10-11。环境：本地 Windows x64、Node.js 24、Electron 43.7.9；浏览器布局检查使用系统 Edge。

## 构建与回归

| 检查 | 结果与范围 |
| --- | --- |
| 类型检查及完整构建 | 通过，包含 React、Electron 主进程与 preload |
| React DOM 回归 | 12 项通过，覆盖状态、导航、数据与编辑 |
| 完整浏览器 UI 回归 | 45 项全部通过，覆盖启动、档位、详情折叠、转场、主题、临时存放、提示浮层、文档共用窗口、真实 PDF worker、全景连续性和惯性 |
| 服务及算法回归 | 58 项：56 通过、1 跳过、1 因 Windows 符号链接权限失败 |
| 打包 EXE | 实际 isPackaged=true、版本 0.2.0；图片、ZIP、7z、PDF、EPUB 打开、翻页与进度保存通过 |
| 安装后的 EXE | 同样五种格式读取与恢复通过，保留 5 条临时记录；原图片内容校验未变化 |
| 安装器往返 | 安装、系统应用信息、快捷方式、打开方式、卸载及默认关联保留通过 |

服务测试的失败发生在 `electron/services/directoryService.test.cjs` 创建损坏文件符号链接的准备阶段，Windows 返回 `EPERM`。现有 7z 字面通配符用例继续跳过。二者均未作为“通过”统计，也没有通过删除或跳过失败断言伪装成功。

UI 回归使用模拟 IPC，实际 PDF.js worker 在浏览器执行；真实 EXE 回归另行覆盖本地桥接、归档读取、EPUB worker 以及用户数据落盘。它们分别验证对应层级，不互相替代。

## 安装验证

使用实际 `OmiComic-Setup-0.2.0-x64.exe` 安装到独立临时目录：

- “已安装的应用”登记 OmiComic、0.2.0 和 Lorcin，并提供卸载程序。
- 桌面及开始菜单共两个快捷方式指向安装目录中的真实 EXE。
- 14 种扩展名的 Open With / Default Apps 能力注册成功；安装和卸载前后默认文件关联相同。
- 安装后的应用在隐藏窗口与独立 userData 下读取五种测试资源，并恢复进度。
- 静默卸载后程序、应用登记和本次快捷方式均清理完成，用户漫画与原有数据不参与测试。

安装器和 EXE 的文件版本、产品名及图标已核对；Authenticode 状态为 **NotSigned**。没有声称具备微软签名信任、通过 SmartScreen 信誉检查或完成全新电脑验证。

## 启动与体积

| 项目 | 优化前 | 优化后 |
| --- | ---: | ---: |
| 首页首屏 JavaScript | 434,385 字节 | 169,431 字节 |
| 首页场景图片 | 2,557,669 字节 PNG | 1,612,808 字节无损 WebP |
| 打包应用文件总量 | 502,662,105 字节 | 341,319,771 字节 |
| EXE 安装包 | — | 100,384,129 字节 |
| 首页就绪中位耗时 | 440.5 ms | 421.6 ms |
| DOMContentLoaded 中位耗时 | 129.4 ms | 108.1 ms |

启动测量为相同机器上的 5 次新进程、独立空资源库、隐藏窗口、已缓存文件系统；不是冷开机测试，也不代表大型真实资源库的绝对耗时。就绪耗时从进程启动计时，DOMContentLoaded 从 renderer 导航计时。原始结果写入被忽略的 `test-results/startup-before.json` 与 `startup-after.json`。

结构改动比微小的时间差更稳定：首次进入才加载资源库/阅读器，首页不初始化隐藏目录扫描；首屏脚本减少约 61%，初始应用数据读取由两次变为一次。图片转换通过解码像素比较，差异为 0。应用文件减少约 32%，安装包约 96 MiB；体积基线与最终产物使用同一 Electron 版本。

## 复现入口

```powershell
npm run build
npm test
npm run test:dom
npm run test:ui
node scripts/measure-startup.cjs test-results/startup.json
npm run dist:win
node --test tests/packaged.electron.cjs
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-installer.ps1
```

安装回归会拒绝覆盖已有同名安装或快捷方式。实际 EXE 测试通过环境变量开启隔离测试目录和隐藏窗口；普通启动不受影响。生成文件与截图位于 `test-results/`，不提交私人漫画、阅读数据或缓存。

更大资源集的检查入口与边界：

- [目录与图片](../tests/DIRECTORY_STRESS.md)
- [压缩包与许可](../tests/ARCHIVE_STRESS.md)
- [文档压力测试](document-stress-results.md)
- [数据兼容](library-data-regression-tests.md)
- [运行时迁移](runtime-security.md)

这些文档保留各自测量时间与样本，历史结果不等同于本版本全部重新执行。真实文档性能脚本为 `tests/document-panorama.electron.cjs`，通过 `COMIC_PERF_FILE` 指定只读测试文件。
