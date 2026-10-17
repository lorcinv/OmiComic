# OmiComic 1.1.36 · Windows & Android

2026-10-17 · [Release](https://github.com/lorcinv/OmiComic/releases/tag/v1.1.36) · [Verification data](releases/verification-1.1.36.json)

## 简体中文

PC 设置底部新增“关于 OmiComic”，手机和 PC 共用 Omi 介绍、版本与 GitHub 链接，支持中、英、日三语。Android 链接通过系统浏览器打开。同步修正手机资源库设置中一条旧名称及其翻译。

类型检查和两端构建通过。单元测试 93 项通过、1 项跳过；DOM 测试 87 项通过。浏览器共覆盖 213 个用例：首轮 208 项通过；校正缩放值等待、旧主题颜色、旧拖拽光效及触摸事件预期后，5 个用例复测通过；最后再次运行关于页和语言相关 8 项，全部通过。

从最终 ZIP 解压运行 Windows 1.1.36，验证关于入口、介绍、版本及外部 GitHub 链接，并回归简介自动保存、重启保留、缩略图双击阅读及键盘打开。APK 在 Android 15 专用模拟器上覆盖安装，核对版本 1.1.36／10136、关于内容及真实触摸发出的 GitHub 浏览器 Intent；回读安装 APK 与交付文件的 SHA-256 一致。

Windows 包内 210 个前端文件、3 个桌面运行文件与构建一致。Android 包内 211 个前端文件与构建一致；四种 ABI、原发布签名和 16 KB 对齐检查通过。安装包不含签名私钥或测试脚本。

GitHub README 和 Release 说明采用中／英／日三语，9 张展示图全部由 Omi 符号占位图生成；不展示真实漫画、个人目录或第三方插画。本轮未连接实体手机，也未重跑大文件性能基准。修改前源码快照保存在本地 .cache/release-1.1.36-baseline。

## English

PC settings now include About OmiComic. Windows and Android share the introduction, version and GitHub project link in Simplified Chinese, English and Japanese. Android hands the project URL to the system browser.

Both distributions were built and checked. The final Windows executable and installed Android APK passed the about/link checks. Package bytes match the current builds; the Android signing certificate and 16 KB native-library alignment are retained. Tests: 93 unit passes, 1 skip, 87 DOM passes; 213 browser cases covered, including five corrected and retested cases, followed by eight passing about/language checks.

All promotional covers, pages and artwork use synthetic Omi symbols. Android runtime checks used an Android 15 emulator, not a physical phone; large-file performance benchmarks were not repeated for this release.

## 日本語

PC 設定に「OmiComic について」を追加し、両プラットフォームの紹介文・バージョン・GitHub リンクを簡体字中国語、英語、日本語で統一しました。Android はシステムブラウザーに URL を渡します。

最終 Windows 実行ファイルとインストール済み Android APK で紹介ページとリンクを検証しました。配布物は現在のビルドと一致し、Android の署名と 16 KB アラインメントを維持しています。単体テスト 93 件成功・1 件スキップ、DOM 87 件成功。ブラウザーは 213 件を確認し、修正した 5 件の再検証と紹介・言語関連の 8 件も成功しました。

紹介画像はすべて Omi のシンボルです。Android は Android 15 エミュレーターで検証し、実機と大容量ファイルの性能測定は今回の対象外です。

## Files / 交付 / 配布物

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| OmiComic-Portable-1.1.36-x64.zip | 140674918 | 585b5b5d9a0f83f5a8db1b58e22d5087efd4686dd865aadcc154bde3ebe68320 |
| OmiComic-1.1.36-android.apk | 14479986 | 75fd92a27e8cb8ea44d9c89411ed72ec2e056367596d0f5969729737e239b88a |

Checksums: [SHA256SUMS-1.1.36.txt](https://github.com/lorcinv/OmiComic/releases/download/v1.1.36/SHA256SUMS-1.1.36.txt). [Preview](images/v1.1.36/overview.png).
