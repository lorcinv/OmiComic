<div align="center">

<img src="resources/icon.png" width="112" alt="OmiComic 图标">

# OmiComic

Windows 与 Android 本地漫画、图片与电子书阅读器。

![Version](https://img.shields.io/badge/version-1.0.0-708090)
![Platform](https://img.shields.io/badge/platform-Windows_x64_%7C_Android-5f7184)

[使用方法](README_使用方法.md) · [Android 说明](docs/ANDROID.md) · [版本更新](CHANGELOG.md)

</div>

## 安装

从 [GitHub 1.0.0 下载页](https://github.com/lorcinv/OmiComic/releases/tag/v1.0.0) 获取 Windows 安装包 **OmiComic-Setup-1.0.0-x64.exe** 或手机安装包 **OmiComic-1.0.0-android.apk**。本地构建输出在 `release/`。

- 安装到当前用户，创建桌面和开始菜单快捷方式。
- Windows“已安装的应用”可识别名称、版本、图标和卸载入口。
- 在文件的“打开方式”中选择 OmiComic；安装不会更改已有默认程序。
- Windows 卸载保留阅读数据和原始漫画文件；Android 卸载会清除应用记录，保留漫画文件。
- Windows EXE 未做 Authenticode 签名；Android APK 已使用持久发布密钥签名。

## 主要功能

- **本地文件管理**：资源卡片菜单或详情中可重命名本地文件，同步迁移阅读进度、收藏、书签和书架引用；删除默认仅移除索引，也可明确选择删除原文件。Windows 移入回收站，Android 为永久删除。
- **Android**：沿用 Omi 首页、插画、雾灰玻璃界面与主题，手机采用两列书库和底部导航，单击打开、滑动翻页、点击左右区域翻页、系统返回和后台保存进度。

- **首页**：最近三本、阅读进度、镜像漫画场景和品牌转场；点击 OmiComic 文字切换首页，图标继续阅读。
- **资源整理**：多根目录、自然排序、搜索、标签、简介、收藏、书签、书架、批量选择和内部引用排序。
- **临时存放**：直接从系统打开、尚未加入资源库的文件保存在这里；右键可删除临时引用，或将所在目录加入资源库。
- **自适应卡片**：七档拖动滑条，默认每行四张；Ctrl＋滚轮上滚放大、下滚缩小，每档铺满当前内容宽度。资源库与详情分别保存档位。
- **详情预览**：封面、续读、标签、简介和每组最多 48 页的按需缩略图；下滚先折叠详情，上滚到顶后略加滚动展开。
- **统一阅读窗口**：图片、压缩包、PDF 和 EPUB 共用工具栏、阅读方向、全景滚动、适应尺寸、进度跳转及书签。
- **阅读手感**：单页/双页、横向/纵向全景、加速拖动与惯性、跳转动画、沉浸全屏、预加载和缓存设置。
- **主题**：经典雾灰、北境雾蓝、暖砂、暮夜灰；控件保持统一圆角与仿玻璃外观。

## 格式支持

| 资源 | 读取方式 |
| --- | --- |
| 图片文件夹、单张图片 | JPG、JPEG、PNG、WebP、BMP、GIF；单图打开时定位到所在目录的对应页 |
| ZIP / CBZ | 按自然顺序读取归档内图片 |
| RAR / CBR、7z / CB7 | 两端均直接读取；Android 支持 RAR4、RAR5 和固实归档，无需手动解压 |
| PDF | 本地 PDF.js worker、分段读取、按页渲染 |
| EPUB | 后台按章解析，净化文本与位图后隔离显示 |

PDF/EPUB 共用阅读窗口；EPUB 以完整章节为阅读单元，进度和书签按章节记录。文档封面及详情缩略图仍使用格式占位。EPUB 不保留出版方完整样式、SVG、远程或交互内容，不支持 DRM；密码保护及多卷归档不支持。

## 数据

漫画内容只在本机读取。普通整理与删除引用不改动原文件；“重命名本地文件”和删除弹窗中的本地删除选项会修改原文件。真实文件操作前保存一份应用记录备份。移除索引后可从资源库恢复文件的显示，已清理的关联记录不会自动恢复。

Windows 设置和阅读记录保存在 Electron `userData/omicomic-data.json`。升级沿用已有数据，卸载保留该目录。Android 保存在应用私有目录，覆盖安装沿用记录，卸载会清除记录。

归档、图片和文档有读取大小、条目数量、超时等限制，见 [归档边界](tests/ARCHIVE_STRESS.md)。缓存设置限制预加载与保留内容，并非整个应用进程的内存硬上限。

## 从源码运行与打包

环境：Windows x64、Node.js 24 和 npm。在源码目录执行：

```powershell
npm ci
npm run dev
```

Android 构建另需 JDK 17+、Android platform 35 和 build-tools 35.0.0，见 [构建说明](docs/ANDROID.md)。

| 命令 | 用途 |
| --- | --- |
| `npm run build` | 类型检查、渲染进程和 Electron 构建 |
| `npm start` | 启动已构建的应用；源码更新后应先重新构建 |
| `npm run dist:win` | 生成图标、构建并输出 x64 EXE 安装包到 `release/` |
| `npm run dist:android` | 构建手机界面、原生文件桥并签名输出 APK 到 `release/` |
| `npm run package:dir` | 生成可直接运行的 `release/win-unpacked/OmiComic.exe` |
| `npm test` | 文件服务、数据、归档、文档与阅读算法测试 |
| `npm run test:dom` | React 状态与交互回归 |
| `npm run test:ui` | 浏览器布局、阅读和交互回归 |
| `node --test tests/packaged.electron.cjs` | 实际打包 EXE 的多格式阅读与持久化验证 |

打包保留当前架构的 7-Zip、必要语言和依赖，将 EPUB worker 放到 ASAR 外；不会把源码、测试、开发工具或完整 `node_modules` 放进安装包。图标源文件为 [resources/icon.svg](resources/icon.svg)。

## 项目文档

- [使用方法](README_使用方法.md)
- [功能与交互逻辑](功能以及交互逻辑.md)
- [版本更新](CHANGELOG.md)
- [当前项目状态](PROJECT_STATUS.md)
- [验证记录与范围](docs/VERIFICATION.md)
- [早期开发变更归档](docs/status/PROJECT_CHANGELOG_INDEX.md)

## 许可证

本项目暂未提供开源许可证。第三方许可证与声明随应用分发，仓库中的归档组件声明见 [licenses](licenses/)。

7-Zip 26.04 按原样分发，其对应源码作为同版本 Release 附件提供；Electron/Chromium、PDF.js 和其他运行依赖的完整许可证保留在应用资源中。
