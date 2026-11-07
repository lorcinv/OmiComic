# Android 原生画面跟随回归

先按项目 Android 构建流程生成 `android/build/classes.jar`，再用 JDK 17 与 Maven 运行：

```powershell
mvn -B -f tests/android-host/pom.xml test
```

Android SDK 不在默认缓存位置时传入 `-Dandroid.jar=绝对路径/android.jar`；`-Dreader.jar=绝对路径/classes.jar` 可以对照同一套测试下的旧、新生产代码。`-Dmotion.cache=绝对缓存目录` 和 `-Dmaven.repo.local=绝对依赖目录` 可隔离运行结果。首次运行从 Maven Central 和 Google Maven 下载测试依赖，不改变应用的运行依赖。

测试执行真实的 `NativeReaderSurface` 类和原生 Skia 绘制，只替代文件库的 I/O；故意阻塞高清解码队列，并注入已解码底图及完成的高清区域。

- 400×600 竖屏和 1000×750 横屏窗口；普通与全景、图片与 PDF 区域规划，共八项。
- 连续斜向、横纵换向后，画面坐标及画布中心的图像颜色必须立即跟随。
- 高清补图完成后位置不变、停止后恢复清晰、缓存不超预算。
- 已排队的新位置优先于较早解码回调，共一项。
- 下一页底图尚未解码时保留原有画面，共一项。

这是原生组件回归，不能替代 APK 中 WebView 与原生层的联动检查，也不测手机帧率、实际 PDF 解码耗时或触屏延迟。设备侧补充测试在 `tests/android/zoom-follow1190.js`，通过 `zoomfollow1190` 测试入口执行。
