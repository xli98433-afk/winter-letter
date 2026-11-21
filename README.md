# 圣诞树礼物网页 · 个人版

一棵由粒子组成的圣诞树：雪花飘落，张开手掌让树散开成星云，点开照片时用金色粒子写出对应的文字。

- 在线预览：https://xli98433-afk.github.io/winter-letter/
- 通用版（上传照片、生成专属链接）：https://winter-gift.pages.dev
- 通用版源码：[xli98433-afk/winter-gift](https://github.com/xli98433-afk/winter-gift)

## 特性

- Three.js 粒子圣诞树、暖金灯光、彩球、礼物盒、树顶星与 Bloom 泛光。
- MediaPipe Hands 手势：张开散开、握拳收回、捏合放大；无摄像头时支持点击/拖拽。
- 照片挂饰与星云散开、照片特写。
- 每张照片对应一句粒子艺术字文案（Zhi Mang Xing 行书）。
- 保存画面、分享、程序化背景音乐。
- 移动端优先，WebGL 不可用时降级。

## 本地预览

需要本地静态服务器（ES Modules 不支持 `file://`）：

```powershell
python -m http.server 8080
```

打开 `http://127.0.0.1:8080/`。摄像头手势需要 `localhost` 或 HTTPS。

## 说明

个人版内容写死在代码中（`js/main.js` 的 `CAPTIONS`）。想要「上传照片 → 生成链接 → 发给别人」的版本，请使用上面的通用版。

字体、Three.js、MediaPipe 与二维码库遵循各自许可证。
