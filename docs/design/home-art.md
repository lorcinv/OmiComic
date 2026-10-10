# 首页人物素材

- 来源：用户提供的 `76646330_p0.jpg`，保留原图。
- 方法：内置 imagegen，保留人物、教室、桌面和画册，整体镜像并调整为灰蓝单色，输出不透明 PNG。
- 应用素材：`src/assets/home-scene.webp`，已经镜像，界面无需再次翻转。
- 0.2.0 将生成的 PNG 转为无损 WebP：2,557,669 → 1,612,808 字节，解码像素比较差异为 0；用户原图未修改。
- 配色：沿用现有灰蓝主题，深色 `#476184`、中间色 `#aab5c3`、纸面 `#f1f3f6`。
- 用途：首页右侧完整场景；CSS 遮罩使左侧逐渐透明，并轻柔羽化上下和右侧边缘。

## 最终处理提示词

Use case: precise-object-edit. Edit the supplied manga image, preserving its entire composition and every detail. Do not redraw, simplify, extract or cut out the character. Keep the original classroom, all desks including the foreground desk and sketchbook, the girl and all background lines. Make only these two changes: (1) horizontally mirror the entire image so the foreground girl is on the RIGHT and her reaching hand is on the right, with the classroom extending toward the LEFT; (2) replace the grayscale black-to-white palette with a very subdued cool slate blue-gray monochrome palette, deepest ink #476184, midtones #aab5c3 and paper/highlights #f1f3f6, matching a frosted gray-blue desktop reading application. Preserve the exact girl's face, expression, pose, original proportions, manga halftones and line quality. Keep the original landscape aspect ratio about 1.35:1. No transparency, no added objects, no gradient baked into the image, no words, no new border, no crop. The app will apply a CSS transparency gradient that fades out toward the left; supply the complete mirrored tinted scene.
