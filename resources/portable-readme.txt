OmiComic Windows x64 免安装版

使用方法
1. 将 ZIP 完整解压到一个文件夹，不能在压缩包里直接运行。
2. 双击文件夹中的 OmiComic.exe 即可打开，无需安装 Node.js 或其他开发工具。
3. 请保留同目录的 resources、locales、DLL 等文件，不要单独移动 OmiComic.exe。

本地数据
阅读记录、收藏、书架和设置保存在本机：
%APPDATA%\OmiComic\omicomic-data.json
可在资源管理器地址栏输入 %APPDATA%\OmiComic 打开数据目录。

免安装版与安装版沿用同一份本地记录，所以在同一台电脑上打开后会看到之前的记录。
发行 ZIP 不包含任何用户的漫画、书库目录、收藏或阅读记录；OmiComic 不提供云同步，也不会自动上传这些内容。
复制免安装程序文件夹到另一台电脑，不会自动带走原电脑的阅读记录。

更新与移除
更新前关闭 OmiComic，将新版解压到新的文件夹后运行；旧的本地记录会继续保留。
不再使用时关闭程序，删除解压出的程序文件夹即可；这不会删除漫画原文件和上述本地记录。
本版本不会运行安装向导、创建开始菜单或桌面快捷方式，也不会注册文件关联。

数字签名
当前免安装版未做 Windows 代码签名，首次运行仍可能出现 Windows 安全提示。

项目与第三方许可
https://github.com/lorcinv/OmiComic
Electron / Chromium 及其他依赖许可随程序分发。
7-Zip 26.04 源码随 GitHub Release 附件提供，第三方声明位于程序资源内。
