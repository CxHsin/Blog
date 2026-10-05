# 奶龙彩蛋

首页头像链接到 `/nailong`。向 `src/assets/nailong/` 添加 PNG、JPG、JPEG 或 WebP 后重新构建、部署即可。文件名按自然顺序排列（2 在 10 之前），无需维护清单。建议使用 5:3 图片；其他比例等比居中裁切，PNG 透明度保留。

渲染槽位、纹理缓存和波浪频率由视口与卡片间距决定，与图片总数无关。新增图片只延长循环内容。动画依赖 Three.js，仅由彩蛋页面加载；使用 WebGL，避免要求 WebGPU。无 JavaScript、WebGL 初始化失败或上下文丢失时显示原生可滚动图库。减少动态效果偏好下停用波浪、横带散开和惯性。

横带几何及解织 shader 改编自 [Clément Grellier 的 Unwoven](https://github.com/clementgrellier/unwoven)，许可见同目录 `UNWOVEN-LICENSE.md`。空间波浪参考 [Saurow Reel Flux](https://saurow-reel.vercel.app/) 的速度驱动正弦形变，使用独立的 WebGL 实现。

验证命令：`bun run check`、`bun run build`，以及针对改动文件的 ESLint / Prettier 检查。

首页主要资源加载完成后，在空闲时间以两个并发请求预加载卷轴初始槽位和两侧相邻图片（包括循环末尾），与彩蛋页共享优化后的 WebP URL，通过浏览器 HTTP 缓存复用。首页不加载 Three.js。彩蛋页在首屏纹理就绪并完成首次渲染后才展示动态卷轴；等待期间由入场遮罩承接，加载失败或超过 15 秒则恢复静态图库。

头像入口用 220ms 圆形背景展开衔接页面导航；卷轴首屏纹理就绪后播放 650ms 横带织入，结束后开放交互。等待超过 1 秒显示“正在展开卷轴”，独立于 WebGL 模块的 15 秒超时保护恢复原生图库。减少动态效果时使用不超过 150ms 的淡入。入口、入场和脚本失败回退的状态验证：`bun test scripts/nailong-entry.test.mjs`。
