/**
 * Loads effect images (e.g. sparkles/bokeh) from public/effects/ for use in background effects.
 * Place PNG (or SVG) images in public/effects/sparkles/ named 1.png, 2.png, ... 8.png
 * (or 1.svg, 2.svg, etc.). See public/effects/sparkles/README.md for where to get free assets.
 */

const SPARKLE_PATHS = [
  '/effects/sparkles/1.png',
  '/effects/sparkles/2.png',
  '/effects/sparkles/3.png',
  '/effects/sparkles/4.png',
  '/effects/sparkles/5.png',
  '/effects/sparkles/6.png',
  '/effects/sparkles/7.png',
  '/effects/sparkles/8.png',
  '/effects/sparkles/1.svg',
  '/effects/sparkles/2.svg',
  '/effects/sparkles/3.svg',
  '/effects/sparkles/4.svg',
]

let sparkleImages: HTMLImageElement[] = []
let sparkleLoadPromise: Promise<HTMLImageElement[]> | null = null

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load ${src}`))
    img.src = src
  })
}

/** Preload sparkle/bokeh images. Call once on app mount. Resolves with loaded images (may be empty). */
export function loadSparkleImages(): Promise<HTMLImageElement[]> {
  if (sparkleLoadPromise) return sparkleLoadPromise
  sparkleLoadPromise = Promise.all(
    SPARKLE_PATHS.map((src) =>
      loadImage(src).catch(() => null)
    )
  ).then((results) => {
    sparkleImages = results.filter((img): img is HTMLImageElement => img != null)
    return sparkleImages
  })
  return sparkleLoadPromise
}

/** Get currently loaded sparkle images (empty until loadSparkleImages has resolved). */
export function getSparkleImages(): HTMLImageElement[] {
  return sparkleImages
}
