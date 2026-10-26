# 主页看板娘素材

## 当前默认：用户原创 Omi

- 原画：用户绘制，源文件为桌面 `omi/omi.psd`；`omi.png` 是摆放参考，`omi tm.png` 是透明线稿。
- 保留原画姿态、表情和整体构图，不镜像；按用户许可仅对裙摆接触点做小幅适配。主人物和三只小 Omi 保存为无损 WebP；签名处双手、双脚的前景层为 `home-omi-signature-front.webp`，感叹号和星星单独导出为 `*-decor.webp`。导入脚本为 `scripts/import-home-artwork.py`，输入用户的 `omi tm.png`，需要 Pillow；该 PNG 与 PSD 最上方透明层像素一致。
- 透明层尺寸为 2355 × 1563。主人物范围为 `(1200, 0)–(2355, 1563)`；独立提取上方 `(517, 276)–(781, 443)`、侧边 `(1117, 881)–(1288, 1127)`、签名处 `(0, 1010)–(299, 1260)` 的小 Omi，并从主人物素材中清除侧边小 Omi。
- 头部纸面逐行跟随原稿最外侧线条，保留网点和半透明笔触；不再用直边多边形切脸。手指、手腕和前臂按各自封闭轮廓提取并合并，避免缺指或断腕。补齐徽标后方未闭合的躯干底色，右脚与左脚的可见鞋面放在徽标前方。手臂与衣身之间的空隙、双腿下方的分叉缝隙保持透明；腿缝逐行跟随原画两条轮廓，不将两腿连成一块。
- 素材通常四周留 2 个原画像素的透明余量，图像布局反向补偿，不挪动原画内容；侧边人物左侧留 18 像素，用于小幅延长裙摆尖角。原裁切边缘不额外补不透明纸面，移除极淡的杂点，避免呆毛尖端和发梢出现方形亮边。
- 左下角按人物、具有完整底盘的品牌图标、双手与鞋面三层绘制；徽标中心按参考图蓝色像素拟合为原图 `(250,1284)`，与手指、双脚贴合。侧边人物脸部沿原素材 x=35 对齐卡片竖边，清除左侧残留断线；接触轮廓按卡片 28px 的实际圆角半径换算回原图坐标，补齐头发和裙摆小范围空洞，两只抓边的手保留在卡片前方。
- `HomeArtworkPalette` 按原稿亮度分离墨色和纸面。雾灰使用 `#345f8d`；夜间使用 `#294f78` 深蓝与 `#a4b8cd` 灰蓝纸面，降低大面积纸面亮度，保留蓝调与明暗反差。取消发亮的外描边，感叹号、星星在夜间单独使用 `#5d7e9f`，保持可读且无光晕。自选图片保留原色。
- 主人物底部从 82% 开始使用缓入缓出的多段透明遮罩，至 97% 完全透明，避免线性渐隐起点的横向色带与底部填充越界；不沿用旧教室插画的大范围左侧渐隐。夜色主页品牌字、句点及横线与看板娘纸面共用灰蓝色。
- 桌面主页按原图 2480 × 1653 等比例校准，以 1440 × 959.806 的逻辑画布适配窗口。原始参考坐标：阅读卡片左上 `(123,420)`；主人物 `(1300,77)`、尺寸 `1155 × 1563`；上方小 Omi `(617,353)`、宽 264；侧边 `(1217,958)`、宽 171；签名处 `(100,1087)`、宽 299。大构图保持原位置；上方小 Omi 对齐分隔线，侧边人物的切边和裙摆交叠点按实际卡片几何对齐；小窗口保留文字与进度短线的可读尺寸。
- 三只小 Omi 属于默认看板娘；自选图片时一同隐藏，恢复默认或自选图片加载失败时一同恢复。手机主页沿用原有紧凑布局。

## 旧版教室插画（仅保留来源记录）

- 来源：用户提供的 `76646330_p0.jpg`，保留原图。
- 方法：内置 imagegen，保留人物、教室、桌面和画册，整体镜像并调整为灰蓝单色，输出不透明 PNG。
- 历史应用素材：`src/assets/home-scene.webp`，曾用于旧版。1.1.40 起从新版源码和程序移除，当前默认使用作者新绘制的 Omi。测试改用项目自有图标，不再引用旧插画。
- 0.2.0 将生成的 PNG 转为无损 WebP：2,557,669 → 1,612,808 字节，解码像素比较差异为 0；用户原图未修改。
- 配色：沿用现有灰蓝主题，深色 `#476184`、中间色 `#aab5c3`、纸面 `#f1f3f6`。
- 用途：首页右侧完整场景；CSS 遮罩使左侧逐渐透明，并轻柔羽化上下和右侧边缘。

## 最终处理提示词

Use case: precise-object-edit. Edit the supplied manga image, preserving its entire composition and every detail. Do not redraw, simplify, extract or cut out the character. Keep the original classroom, all desks including the foreground desk and sketchbook, the girl and all background lines. Make only these two changes: (1) horizontally mirror the entire image so the foreground girl is on the RIGHT and her reaching hand is on the right, with the classroom extending toward the LEFT; (2) replace the grayscale black-to-white palette with a very subdued cool slate blue-gray monochrome palette, deepest ink #476184, midtones #aab5c3 and paper/highlights #f1f3f6, matching a frosted gray-blue desktop reading application. Preserve the exact girl's face, expression, pose, original proportions, manga halftones and line quality. Keep the original landscape aspect ratio about 1.35:1. No transparency, no added objects, no gradient baked into the image, no words, no new border, no crop. The app will apply a CSS transparency gradient that fades out toward the left; supply the complete mirrored tinted scene.
