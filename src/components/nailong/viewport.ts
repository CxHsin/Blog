export function reelLayout(width: number, height: number) {
  const aspect = Math.max(1, width) / Math.max(1, height)
  const worldHeight = 2 * Math.tan((24 * Math.PI) / 180) * 5
  const worldWidth = worldHeight * aspect
  const narrow = aspect < 1.1
  const cardWidth = Math.min(
    worldWidth * (narrow ? 0.7 : 0.42),
    (worldHeight * (narrow ? 0.35 : 0.4) * 5) / 3
  )
  const pitch = cardWidth * 1.015
  return { worldWidth, worldHeight, cardWidth, pitch, count: Math.ceil(worldWidth / pitch) + 6 }
}

export function initialImageIndices(length: number, width: number, height: number) {
  if (!length) return []
  const { count } = reelLayout(width, height)
  const half = Math.floor(count / 2)
  return [
    ...new Set(
      Array.from({ length: count + 2 }, (_, i) => i - half - 1)
        .sort((a, b) => Math.abs(a) - Math.abs(b))
        .map((index) => ((index % length) + length) % length)
    )
  ]
}
