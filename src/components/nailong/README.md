# 奶龙彩蛋

首页头像链接到 `/nailong`。向 `src/assets/nailong/` 添加 PNG、JPG、JPEG 或 WebP 后重新构建、部署即可。文件名按自然顺序排列（2 在 10 之前），无需维护清单。建议使用 5:3 图片；其他比例等比居中裁切，PNG 透明度保留。

渲染槽位、纹理缓存和波浪频率由视口与卡片间距决定，与图片总数无关。新增图片只延长循环内容。动画依赖 Three.js，仅由彩蛋页面加载；使用 WebGL，避免要求 WebGPU。无 JavaScript、WebGL 初始化失败或上下文丢失时显示原生可滚动图库。减少动态效果偏好下停用波浪、横带散开和惯性。

横带几何及解织 shader 改编自 [Clément Grellier 的 Unwoven](https://github.com/clementgrellier/unwoven)，许可见同目录 `UNWOVEN-LICENSE.md`。空间波浪参考 [Saurow Reel Flux](https://saurow-reel.vercel.app/) 的速度驱动正弦形变，使用独立的 WebGL 实现。

验证命令：`bun run check`、`bun run build`，以及针对改动文件的 ESLint / Prettier 检查。
