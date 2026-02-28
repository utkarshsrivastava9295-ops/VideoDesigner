/**
 * Local open-source anime conversion using AnimeGAN (TensorFlow.js).
 * Model: AnimeGAN.js (https://github.com/TonyLianLong/AnimeGAN.js)
 * Runs entirely in the browser, no API key required.
 */

import * as tf from '@tensorflow/tfjs'
import { loadGraphModel, registerOp } from '@tensorflow/tfjs-converter'

/** Prefer local model (after npm run download-models / download-animegan); fallback to CDN. */
const MODEL_CDN = 'https://cdn.jsdelivr.net/gh/TonyLianLong/AnimeGAN.js@master/public/model_full'
const getLocalModelUrl = () =>
  typeof window !== 'undefined'
    ? `${window.location.origin}/models/animegan/model.json`
    : ''
const getCdnModelUrl = () => (MODEL_CDN ? `${MODEL_CDN}/model.json` : '')

/** Mirror pad implementation for AnimeGAN custom op (reflect mode). */
function mirrorPadFunc(
  input: tf.Tensor,
  padArr: number[][]
): tf.Tensor {
  return tf.tidy(() => {
    let x: tf.Tensor = input
    for (let i = 0; i < 4; i++) {
      if (padArr[i][0] !== 0 || padArr[i][1] !== 0) {
        const sliceSize = [-1, -1, -1, -1] as number[]
        sliceSize[i] = padArr[i][0]
        const sliceBegin = [0, 0, 0, 0]
        const paddingLeft = x.slice(sliceBegin, sliceSize)

        const sliceSizeR = [-1, -1, -1, -1] as number[]
        sliceSizeR[i] = padArr[i][1]
        const sliceBeginR = [0, 0, 0, 0]
        sliceBeginR[i] = (x.shape[i] as number) - padArr[i][1]
        const paddingRight = x.slice(sliceBeginR, sliceSizeR)

        x = tf.concat([paddingLeft, x, paddingRight], i)
      }
      if (padArr[i][0] > 1 || padArr[i][1] > 1) {
        throw new Error(
          'Only padding length <= 1 supported. Got: ' + JSON.stringify(padArr)
        )
      }
    }
    return x
  })
}

/** Register MirrorPad custom op before loading the model. */
function registerMirrorPad(): void {
  try {
    registerOp('MirrorPad', async (node: { inputs: tf.Tensor[]; attrs: Record<string, unknown> }) => {
      await tf.nextFrame()
      const attrs = node.attrs as { mode?: string }
      if (attrs.mode !== 'reflect') {
        throw new Error('Only reflect mode supported. Mode: ' + attrs.mode)
      }
      const padTensor = node.inputs[1]
      const input = node.inputs[0]
      if (input.shape.length !== 4) {
        throw new Error('Only rank 4 input supported')
      }
      const padArr = (await padTensor.array()) as number[][]
      return mirrorPadFunc(input, padArr)
    })
  } catch {
    // Already registered or not available
  }
}

let cachedModel: tf.GraphModel | null = null

/**
 * Load the AnimeGAN graph model (with MirrorPad custom op). Cached after first load.
 * Tries local model first (offline, after npm run download-models), then CDN.
 */
async function getModel(onProgress?: (message: string) => void): Promise<tf.GraphModel> {
  if (cachedModel) return cachedModel
  registerMirrorPad()
  const localUrl = getLocalModelUrl()
  const cdnUrl = getCdnModelUrl()
  if (!localUrl && !cdnUrl) throw new Error('Model URL not available')
  onProgress?.('Loading AnimeGAN model…')
  try {
    if (localUrl) {
      const ok = await fetch(localUrl, { method: 'HEAD' }).then((r) => r.ok).catch(() => false)
      if (ok) {
        cachedModel = await loadGraphModel(localUrl)
        return cachedModel
      }
    }
  } catch {
    // Fall through to CDN
  }
  if (cdnUrl) {
    cachedModel = await loadGraphModel(cdnUrl)
    return cachedModel
  }
  throw new Error('Failed to load AnimeGAN model. Run: npm run download-models')
}

/** Max long side for resize; -1 = no resize (full size, slower). */
const DEFAULT_LONG_SIDE = 512

/**
 * Convert a single image to anime style using local AnimeGAN (TensorFlow.js).
 * Returns object URL of the result image (caller should revoke when done).
 */
export async function convertImageToAnimeLocal(
  imageSource: string | HTMLImageElement | HTMLCanvasElement,
  onProgress?: (message: string) => void,
  longSideSize: number = DEFAULT_LONG_SIDE
): Promise<string> {
  const model = await getModel(onProgress)
  onProgress?.('Converting to anime…')

  let imgTensor: tf.Tensor3D

  if (typeof imageSource === 'string') {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = imageSource.startsWith('data:') || imageSource.startsWith('http')
        ? imageSource
        : imageSource
    })
    imgTensor = tf.browser.fromPixels(img)
  } else {
    imgTensor = tf.browser.fromPixels(imageSource)
  }

  const scaled = tf.tidy(() => {
    const [h, w] = imgTensor.shape.slice(0, 2)
    const longSide = Math.max(h, w)
    let scaledTensor: tf.Tensor4D
    if (longSideSize > 0 && longSide > longSideSize) {
      const scale = longSide / longSideSize
      const newH = Math.round((h as number) / scale)
      const newW = Math.round((w as number) / scale)
      scaledTensor = tf.image
        .resizeBilinear(imgTensor as tf.Tensor3D, [newH, newW])
        .div(255)
        .expandDims(0) as tf.Tensor4D
    } else {
      scaledTensor = imgTensor.div(255).expandDims(0) as tf.Tensor4D
    }
    return scaledTensor
  })
  imgTensor.dispose()

  const out = await model.executeAsync({ test: scaled }) as tf.Tensor
  scaled.dispose()
  if (!out) throw new Error('Model returned no output')

  const squeezed = Array.isArray(out) ? out[0] : out
  const normalized = tf.tidy(() =>
    (squeezed as tf.Tensor).squeeze([0]).add(1).div(2)
  )
  const canvas = document.createElement('canvas')
  const [outH, outW] = normalized.shape.slice(0, 2) as number[]
  canvas.width = outW
  canvas.height = outH
  await tf.browser.toPixels(normalized as tf.Tensor3D, canvas)
  normalized.dispose()
  if (Array.isArray(out)) out.forEach((t) => t.dispose())
  else out.dispose()

  onProgress?.('Done')
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(URL.createObjectURL(blob))
        else reject(new Error('Canvas toBlob failed'))
      },
      'image/png',
      0.95
    )
  })
}

/**
 * Check if local anime conversion is available (browser + model URL).
 */
export function isLocalAnimeAvailable(): boolean {
  return typeof window !== 'undefined' && (!!getLocalModelUrl() || !!getCdnModelUrl())
}
