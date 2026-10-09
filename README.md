<div align="center">

# OmiComic

一款面向 Windows 的本地漫画与图片阅读器。

专注于清晰的资源整理、快速的缩略图浏览，以及舒适、可调节的沉浸式阅读体验。

![Version](https://img.shields.io/badge/version-0.1.3-708090)
![Platform](https://img.shields.io/badge/platform-Windows-5f7184)
![Electron](https://img.shields.io/badge/Electron-43-47848f)
![React](https://img.shields.io/badge/React-18-5c7080)
![TypeScript](https://img.shields.io/badge/TypeScript-5-66788a)

</div>

## 项目简介

OmiComic 是一个本地优先的桌面漫画阅读器。它不会上传漫画内容，也不会移动、重命名或修改原始文件；资源库、阅读进度、收藏、书签、标签和书架等数据保存在本机应用数据目录中。

当前仓库处于开发阶段，适合从源码运行和参与测试，暂未提供正式安装包。

## 主要功能

### 首页

- 最近三本漫画、阅读进度与原创手绘线稿插画。
- 点击资源库中的 OmiComic 文字或图标返回首页。

### 资源浏览与整理

- 添加多个漫画根目录，并以缩略图网格浏览本地资源。
- 支持自然排序、文件夹优先、卡片尺寸与分页数量调节。
- 提供书架、收藏、最近阅读、页面书签、标签、备注和模糊/精确标签筛选。
- 支持多选、框选、拖拽排序，以及资源在不同书架间移动或复制。
- 记录路径失效状态，并允许清理 OmiComic 内部的无效引用，不删除磁盘中的原始文件。

### 阅读详情与缩略图预览

- 展示封面、页数、阅读进度、标签和简介。
- 支持续读入口、每组最多 48 页的按需缩略预览及原页码跳转。
- 无标签时可直接添加；简介点击编辑框外保存退出。
- 详情信息可直接整理，阅读状态会在资源库中同步更新。

### 阅读器

- 单页与双页阅读。
- 从左到右或从右到左的双页顺序。
- 横向与纵向阅读流。
- 适应宽度、适应高度和原始尺寸。
- 全景连续阅读、画布拖动与惯性滚动。
- 沉浸模式、自动隐藏控件和可拖动阅读进度条。
- 双页首页单独显示、跨页检测、滚轮翻页和页面书签。
- 可配置预加载页数、图片加载并发数及内存缓存大小。

## 支持的资源

| 资源 | 状态 | 说明 |
| --- | --- | --- |
| 图片文件夹 | 支持 | 按文件名自然排序读取目录中的图片 |
| 单张图片 | 支持 | 从所在目录建立连续阅读列表 |
| ZIP / CBZ | 支持 | 读取压缩包内的图片；暂不支持加密压缩包 |
| RAR / CBR、7z / CB7 | 支持 | 7-Zip 后台按页读取；密码、多卷归档不支持 |
| PDF | 开发版支持 | PDF.js worker、分段读取、按需单页渲染 |
| EPUB | 开发版支持 | 后台按章解析，净化文本/位图，隔离显示 |

支持的图片格式：`JPG`、`JPEG`、`PNG`、`WebP`、`BMP`、`GIF`。

> 归档单张解压图片上限 256 MiB，条目最多 20,000，另有压缩比/总展开大小/超时限制；详情预览使用更低限制。见 [压缩包测试与边界](tests/ARCHIVE_STRESS.md)。

## 从源码运行

### 环境要求

- Windows
- Git
- Node.js 与 npm（建议使用当前 LTS 版本）

### 安装与开发

```powershell
git clone https://github.com/lorcinv/OmiComic.git
cd OmiComic
npm ci
npm run dev
```

### 构建并运行

```powershell
npm run build
npm start
```

`npm start` 会运行已经生成的 Electron 构建产物，因此首次启动前请先执行 `npm run build`。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 同时启动 Vite 开发服务器和 Electron |
| `npm run typecheck` | 检查渲染进程与 Electron 主进程类型 |
| `npm run build:renderer` | 构建 React 渲染进程 |
| `npm run build:electron` | 构建 Electron 主进程与预加载脚本 |
| `npm run build` | 执行完整类型检查与构建 |
| `npm start` | 启动已构建的桌面应用 |
| `npm test` | 运行算法、文件系统、归档及文档回归/压力测试 |
| `npm run test:dom` | React DOM 交互回归 |
| `npm run test:ui` | 可用 Chromium 环境下的浏览器界面回归 |

## 项目结构

```text
OmiComic/
├─ electron/
│  ├─ main.ts                 # Electron 主进程与 IPC
│  ├─ preload.ts              # 安全的渲染进程桥接接口
│  └─ services/               # 数据、压缩包和缩略图服务
├─ src/
│  ├─ pages/
│  │  ├─ LibraryPage.tsx      # 资源库、详情与整理功能
│  │  └─ ReaderPage.tsx       # 漫画阅读器
│  ├─ styles/                 # 全局样式与主题变量
│  ├─ types/                  # 前后端共享类型
│  └─ App.tsx                 # 页面切换与应用入口
├─ package.json
└─ vite.config.ts
```

## 数据与安全

- 用户数据写入 Electron 的 `userData` 目录，主数据文件名为 `omicomic-data.json`。
- 漫画图片和压缩包只从用户明确选择的本地路径读取。
- Electron 使用 `nodeIntegration: false`、`contextIsolation: true` 和 `sandbox: true`。
- 渲染进程仅通过预加载脚本暴露的受控 IPC 接口访问本地能力。
- 删除收藏、书签、标签、书架或根目录记录不会删除原始漫画文件。

建议在重要升级或迁移前备份系统中的 OmiComic 用户数据目录。

## 当前限制

- 目前仅面向 Windows 开发和验证。
- 新 PDF/EPUB 界面按单页/章节阅读；图片阅读器的全景、双页和页级书签不适用于此界面。
- EPUB 出版方样式、SVG、交互及远程内容会被移除；不支持 DRM。
- 文档封面保持格式占位；页数在实际打开时读取。
- 不支持加密、多卷压缩包；超限文件会安全失败。
- 本轮新增功能在 Linux 做了自动化测试；Windows 视觉、鼠标手感及安装包验证仍需完成。
- 可见大图可能超过用户设置的缓存预算；此设置不是整个进程的内存硬上限。
- 仓库目前没有安装包生成与自动发布流程。

## 参与开发

欢迎通过 Issue 提交错误报告和功能建议。提交问题时，建议附上：

1. Windows、Node.js 与 OmiComic 版本。
2. 资源类型、图片格式和大致页数。
3. 可复现步骤、预期结果和实际结果。
4. 不包含私人漫画内容或敏感路径的截图与日志。

提交代码前请至少运行：

```powershell
npm run typecheck
npm run build
npm test
npm run test:dom
```

## 许可证

第三方 7-Zip 的 LGPL/BSD/unRAR 限制及 npm 封装许可证见 `licenses/`；未来分发安装包须保留声明并满足对应源码提供义务。

本项目目前尚未提供开源许可证。除非仓库后续明确加入许可证文件，否则代码的使用、复制和分发仍受默认版权规则约束。

