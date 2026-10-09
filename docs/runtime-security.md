# Electron 运行时升级与安全验证

核验日期：2026-10-09。

## 最终版本与选择依据

最终固定为 **Electron 43.7.9**，而不是原始的 39.8.5 或中间验证过的 39.8.10 / 41.10.7。只升级 39 的补丁版本，无法覆盖本次审计发现的全部 Electron 安全公告；41 虽包含这些公告的修复，但已停止维护。

按照 [Electron 官方发布计划](https://releases.electronjs.org/schedule)，核验日仍受支持的稳定主版本包含 42、43 和 44。42 将于 **2026-10-20** 结束维护，只剩 11 天；43 的结束维护日期为 **2027-01-05**。最终选择 43，在包含所需修复的同时保留更合理的维护窗口，也避免直接迁移到 44 的额外兼容性变化。应在 2027-01-05 前迁移到当时仍受支持的版本；发布安装包前再次核验支持周期和安全公告。

[43.7.9 官方发行说明](https://releases.electronjs.org/release/v43.7.9)记载其发布日期为 2026-10-06。运行时变化如下：

| 组件 | 39.8.10（中间补丁基线） | 43.7.9（最终） |
|---|---|---|
| Chromium | 142.0.7444.265 | 150.0.7871.250 |
| Node.js | 22.22.1 | 24.21.0 |
| V8 | 14.2.231.22 | 15.0.245.31 |

旧版本信息来自 [39.8.10 官方发行说明](https://releases.electronjs.org/release/v39.8.10)。最终版本信息还通过实际下载的 Electron 二进制以 `ELECTRON_RUN_AS_NODE=1` 运行并读取 `process.versions` 验证；该步骤没有启动浏览器窗口或监听套接字。

## 核验的安全公告

下表链接为 Electron 官方仓库发布的公告。版本列列出本次选择所依据的修复门槛，不是所有已修复版本的完整清单。

| 公告 | 风险范围 | 41 / 42 / 43 系列修复门槛 |
|---|---|---|
| [GHSA-hq2x-r82h-9wj4](https://github.com/electron/electron/security/advisories/GHSA-hq2x-r82h-9wj4) | 沙箱 iframe 打开的弹窗未继承 HTML 沙箱限制 | 41.10.4 / 42.5.2 / 43.0.0 |
| [GHSA-gr2m-v5gq-v685](https://github.com/electron/electron/security/advisories/GHSA-gr2m-v5gq-v685) | 沙箱顶层文档打开的新窗口未继承限制 | 41.10.6 / 42.9.2 / 43.4.1 |
| [GHSA-j84w-jfhq-vhvj](https://github.com/electron/electron/security/advisories/GHSA-j84w-jfhq-vhvj) | 部分自定义文件/HTTP 协议配置允许跨源读取 | 41.10.6 / 42.9.2 / 43.4.1 |
| [GHSA-9qh4-3jw8-366w](https://github.com/electron/electron/security/advisories/GHSA-9qh4-3jw8-366w) | webview 的 Worker 可越过嵌入方的 Node 集成限制 | 41.10.6 / 42.9.2 / 43.4.1 |

43.7.9 高于这四项的 43 系列修复门槛。本次源码检查还确认主窗口使用 `nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`、`webSecurity: true`，并拒绝在 Electron 中创建弹窗；EPUB 使用空权限的 `sandbox=""` iframe。没有发现开启 webview 或注册相关自定义文件/HTTP 协议的代码。这些是现有的纵深防护，不能代替及时升级运行时，也不是对所有攻击面的安全认证。

## 开发与部署变化

这是 **39 → 43 的跨主版本升级**。除了类型检查，仍需验证 Node、Chromium、字体渲染、GPU、原生图片解码、窗口行为和预加载脚本。

- Electron 43 的 npm 包要求开发用 Node.js **>= 22.12.0**；测试工具另有自己的最低 Node 版本要求，应使用满足所有依赖要求的 Node 24 环境。
- 从 Electron 42 起不再依赖 npm `postinstall` 立即下载二进制，首次获取可执行路径时会按需下载。CI 或离线打包前应显式运行 `npx install-electron --no`，提前准备二进制。详见 [官方破坏性变更](https://www.electronjs.org/docs/latest/breaking-changes)。
- 在默认用户缓存目录不可写的环境中，可用 `electron_config_cache` 指向项目内可写的 `.cache/electron`。不要删除安全校验或改用未验证的下载源。
- 必须重新生成构建产物；不要把旧版 Electron 的 `dist` 与新版 package-lock 混用。
- RAR/7z 的 Windows 打包还需要保留并解包匹配的 `7z.exe`、`7z.dll` 和许可证，详见 `tests/ARCHIVE_STRESS.md`。

## 实际验证结果

- `package.json`、lockfile 根依赖、lockfile 安装项、已安装 npm 包、`electron/dist/version` 均为 **43.7.9**。
- 实际二进制 Node 模式启动成功，报告 Electron 43.7.9 / Node 24.21.0 / Chromium 150.0.7871.250。
- `npm run build` 通过，包括应用及 Electron 两侧 TypeScript 检查、Vite 生产构建、Electron TypeScript 构建。
- 最终依赖树执行 `npm audit --json`：**0 项已知漏洞**，包含开发依赖；此前 Electron 下载工具链和旧测试工具链的警告已不在最终审计结果中。

## 仍需验证与剩余风险

- **原生 Windows 图形界面与打包启动尚未验证**。本环境未启动真实浏览器或 Electron 图形窗口，Node 模式启动和构建成功不等于 UI 冒烟测试通过。
- 发布前应在 Windows 检查启动/退出、无边框窗口拖动和缩放、文件对话框、双层目录导航、大 PDF 和 EPUB 的首屏及快速切换、缩略图、压缩包阅读、安装包内 ASAR 路径和原生 7-Zip DLL 加载。
- 43 系列支持到 2027-01-05；后续仍需安排受支持版本迁移。
- `npm audit` 只反映当时注册表已收录的依赖公告，不证明应用代码或所有捆绑二进制不存在漏洞。7-Zip 二进制另做了来源及字节匹配验证，仍应跟进其原生安全公告。
- 本次没有为了消除审计输出而使用 `npm audit fix --force`，也没有关闭 Electron 沙箱、浏览器安全检查或网络限制。
