import type { ImageMetadata } from 'astro'
import { getImage } from 'astro:assets'

const files = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/nailong/*.{png,jpg,jpeg,webp,PNG,JPG,JPEG,WEBP}',
  { eager: true }
)
export const images = await Promise.all(
  Object.entries(files)
    .sort(([a], [b]) => a.localeCompare(b, 'zh-CN', { numeric: true }))
    .map(async ([path, { default: image }]) => ({
      src: (await getImage({ src: image, width: Math.min(image.width, 1600), format: 'webp' })).src,
      name: path
        .split('/')
        .pop()!
        .replace(/\.[^.]+$/, ''),
      width: image.width,
      height: image.height
    }))
)
