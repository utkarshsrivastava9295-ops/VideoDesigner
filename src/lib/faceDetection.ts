/**
 * Face detection for "face nod" animation.
 * Uses face-api.js SSD MobileNet V1 (more accurate than Tiny). Requires model files
 * in public/models/ (see public/models/README.md). Run: npm run download-models
 */

export type FaceBox = { x: number; y: number; width: number; height: number }

let loadPromise: Promise<boolean> | null = null

const MODEL_BASE = '/models'
const FACE_PADDING = 0.2

async function loadModels(): Promise<boolean> {
  if (loadPromise != null) return loadPromise
  loadPromise = (async () => {
    try {
      const faceapi = await import('face-api.js')
      await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_BASE)
      return true
    } catch {
      console.warn('Face detection models could not be loaded. Run npm run download-models to add SSD MobileNet V1 to public/models/')
      return false
    }
  })()
  return loadPromise
}

/**
 * Detect a single face in the image. Returns bounding box in image pixel coordinates,
 * with optional padding, or null if no face or models not loaded.
 */
export async function detectFaceInImage(img: HTMLImageElement): Promise<FaceBox | null> {
  const loaded = await loadModels()
  if (!loaded) return null
  try {
    const faceapi = await import('face-api.js')
    const detection = await faceapi.detectSingleFace(img, new faceapi.SsdMobilenetv1Options({
      minConfidence: 0.5,
      maxResults: 1,
    }))
    if (!detection?.box) return null
    const b = detection.box
    const padW = b.width * FACE_PADDING
    const padH = b.height * FACE_PADDING
    return {
      x: Math.max(0, b.x - padW),
      y: Math.max(0, b.y - padH),
      width: Math.min(img.naturalWidth - Math.max(0, b.x - padW), b.width + 2 * padW),
      height: Math.min(img.naturalHeight - Math.max(0, b.y - padH), b.height + 2 * padH),
    }
  } catch {
    return null
  }
}

/**
 * Detect face for each image. Returns array of FaceBox | null in same order as images.
 */
export async function detectFacesInImages(imgs: HTMLImageElement[]): Promise<(FaceBox | null)[]> {
  const results: (FaceBox | null)[] = []
  for (const img of imgs) {
    results.push(await detectFaceInImage(img))
  }
  return results
}
