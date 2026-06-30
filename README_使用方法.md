# OmiComic Codex 提示词使用方法

## 1. 文件说明

建议把这些 `.md` 文件放到 OmiComic 项目根目录：

```txt
omicomic/
├─ 00_给Codex的启动总提示.md
├─ 01_产品需求_PRD.md
├─ 02_技术架构与安全约束.md
├─ 03_MVP任务拆分.md
├─ 04_文件读取_图片_压缩包_PDF.md
├─ 05_UI_UX_资源管理器与阅读器.md
├─ 06_数据缓存_设置_阅读进度.md
├─ 07_Codex低耗协作规则.md
└─ PROJECT_STATUS.md
```

首次使用时，把 `PROJECT_STATUS_模板.md` 改名为：

```txt
PROJECT_STATUS.md
```

## 2. 第一次给 Codex 的提示词

```txt
请读取以下文档：
1. 00_给Codex的启动总提示.md
2. 01_产品需求_PRD.md
3. 02_技术架构与安全约束.md
4. 03_MVP任务拆分.md
5. PROJECT_STATUS.md

本轮只完成第 0 轮：初始化 Electron + Vite + React + TypeScript 项目。

要求：
1. 生成可运行的项目骨架。
2. 所有 UI 文案使用简体中文。
3. 使用 Electron 安全配置：nodeIntegration false，contextIsolation true。
4. 创建 LibraryPage、ReaderPage 的基础页面结构即可。
5. 不要实现 ZIP/CBZ。
6. 不要实现 PDF。
7. 不要实现复杂缩略图缓存。
8. 不要打包安装程序。
9. 输出完整项目结构、必要文件代码、运行命令、测试步骤。
10. 最后更新 PROJECT_STATUS.md。
```

## 3. 后续每轮提示词模板

```txt
本轮任务：实现【这里写具体功能】。

请只读取：
1. PROJECT_STATUS.md
2. 【本轮功能对应的需求文档.md】

要求：
1. 不重构无关模块。
2. 不重复解释项目背景。
3. 不重新输出所有文件。
4. 只输出本轮新增或修改的文件。
5. 完成后更新 PROJECT_STATUS.md。
6. 给出最短测试步骤。
```

## 4. 推荐开发顺序

```txt
第 0 轮：初始化项目
第 1 轮：资源管理器基础
第 2 轮：缩略图网格与分页
第 3 轮：文件夹图片阅读器
第 4 轮：ZIP/CBZ 阅读
第 5 轮：PDF 阅读
第 6 轮：阅读模式增强
第 7 轮：设置、收藏、最近打开、阅读进度
第 8 轮：性能优化
第 9 轮：UI 细节打磨
```

## 5. 遇到报错时的提示词

```txt
这是当前报错：

【粘贴报错】

请只做最小修复：
1. 先判断报错来源。
2. 只读取 PROJECT_STATUS.md 和相关文件。
3. 不重构无关模块。
4. 输出需要修改的文件。
5. 给出修复后的测试步骤。
```

## 6. 最重要的省 token 原则

不要让 Codex 每轮都读全部文档。

对应关系：

- 搭项目：00、01、02、03、PROJECT_STATUS
- 文件夹读取：04、PROJECT_STATUS
- ZIP/CBZ：04、PROJECT_STATUS
- PDF：04、PROJECT_STATUS
- UI：05、PROJECT_STATUS
- 设置与进度：06、PROJECT_STATUS
- 协作规则：07、PROJECT_STATUS
