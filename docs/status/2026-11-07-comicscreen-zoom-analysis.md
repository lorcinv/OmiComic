# ComicScreen 放大图片拖动对照

本轮继续检查用户提供的 ComicScreen 2260 APK 与项目已有反编译结果，范围为单图放大后的平移、松手惯性和停止条件。

APK：`D:/下载/手机/漫画阅读器(ComicScreen).apk`。本轮重新计算 SHA-256，仍为 `a565e7469804864e342a52188327994237c04952e548fb55d80038ed6cfa5baa`，与上一轮 REA 归档检查一致。归档 Evidence 与工具限制见 [此前记录](2026-11-07-comicscreen-panorama-analysis.md)。本次调用 REA `inspect_android_method` 仍返回 `capability_unavailable`：环境缺少 `REA_JADX_MCP_JAR`；因此继续读取现有 JADX 输出，没有安装或改动工具配置。

以下路径相对 `.cache/comicscreen-audit/decoded/sources/`：

| 位置 | 观察到的机制 |
| --- | --- |
| `H0/b.java:74–79` | 使用设备的最小甩动速度与触摸起拖阈值。 |
| `H0/b.java:94–149` | DOWN 创建速度跟踪器；MOVE 按实际位移触发平移并采样；UP 计算横、纵速度，满足阈值后启动惯性。 |
| `H0/m.java:127–150` | 惯性建立独立的滚动任务，拖动直接修改图片平移矩阵。 |
| `H0/m.java:301–365` | 根据图片与窗口尺寸计算横纵边界，调用 `OverScroller.fling`；逐帧读取坐标差，更新矩阵并继续调度。没有额外越界距离。 |
| `H0/m.java:490–495,740–760` | 新按下会调用停止逻辑，结束当前惯性；多指手势另行处理。 |

源文件摘要：`H0/b.java` 为 `73cc0add0d279344d1355a0730af66582f113db16e4507745450448ce646ebad`，`H0/m.java` 为 `483106d9207c868fecbf1b99d0274c8b5451894512f91230cae36772589e4c0c`。

可借鉴的是“拖动直接跟随、松手根据速度续滑、边界停止、按下立即接管”。本轮据此为 Omi 独立实现双端惯性，没有复制反编译代码，也没有把它解释成固定的拖动加速倍率。没有运行 ComicScreen，不能据此比较两款软件的延迟或帧率。
