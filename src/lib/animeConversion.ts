/**
 * Anime conversion: local open-source (AnimeGAN/TF.js) or cloud (Replicate AnimeGANv3).
 * Local: no API key, runs in browser. Replicate: requires API token.
 */

import { convertImageToAnimeLocal, isLocalAnimeAvailable } from './animeConversionLocal'

export type AnimeBackend = 'local' | 'replicate'

const REPLICATE_ANIMEGAN_VERSION = '9f0bd56b2b1cf39717a79b9268d8f98c267872c75e3ffb9e9f9b2cf78694bc3b'
const REPLICATE_API = 'https://api.replicate.com/v1'

export type AnimeStyle =
  | 'AnimeGANv3_Arcane'
  | 'AnimeGANv3_Hayao'
  | 'AnimeGANv3_Shinkai'
  | 'AnimeGANv3_PortraitSketch'
  | 'AnimeGANv3_JP'
  | 'AnimeGANv3_Shinkai_53'
  | 'AnimeGANv3_FacePortrait_v2'

const DEFAULT_STYLE: AnimeStyle = 'AnimeGANv3_Arcane'

function getApiKey(formKey?: string): string | null {
  const key = formKey?.trim() || (typeof import.meta !== 'undefined' && (import.meta as unknown as { env?: { VITE_REPLICATE_API_TOKEN?: string } }).env?.VITE_REPLICATE_API_TOKEN)
  return key || null
}

/**
 * Create a prediction and wait for it to complete (polling).
 */
async function runPrediction(
  apiKey: string,
  imageDataUrl: string,
  style: AnimeStyle = DEFAULT_STYLE,
  onProgress?: (message: string) => void
): Promise<string> {
  onProgress?.('Starting anime conversion…')
  const res = await fetch(`${REPLICATE_API}/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: REPLICATE_ANIMEGAN_VERSION,
      input: {
        image: imageDataUrl,
        style,
      },
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Replicate API error: ${res.status} ${err}`)
  }
  const pred = (await res.json()) as { id: string; urls: { get: string } }
  const getUrl = pred.urls.get

  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    onProgress?.(`Converting… (${i + 1})`)
    const statusRes = await fetch(getUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!statusRes.ok) throw new Error(`Replicate status error: ${statusRes.status}`)
    const status = (await statusRes.json()) as { status: string; output?: string | string[] }
    if (status.status === 'succeeded') {
      const out = status.output
      if (typeof out === 'string') return out
      if (Array.isArray(out) && out.length > 0 && typeof out[0] === 'string') return out[0]
      throw new Error('Unexpected Replicate output format')
    }
    if (status.status === 'failed' || status.status === 'canceled') {
      throw new Error(`Replicate prediction ${status.status}`)
    }
  }
  throw new Error('Anime conversion timed out')
}

/**
 * Convert a single image to anime style using the chosen backend.
 * Returns object URL of the result image (caller should revoke when done).
 */
export async function convertImageToAnime(
  imageSource: string,
  apiKey: string,
  style: AnimeStyle = DEFAULT_STYLE,
  onProgress?: (message: string) => void,
  backend: AnimeBackend = 'local'
): Promise<string> {
  if (backend === 'local') {
    return convertImageToAnimeLocal(imageSource, onProgress)
  }
  const key = getApiKey(apiKey)
  if (!key) throw new Error('Replicate API key required. Set VITE_REPLICATE_API_TOKEN or enter in settings.')

  let dataUrl: string
  if (imageSource.startsWith('data:')) {
    dataUrl = imageSource
  } else {
    const r = await fetch(imageSource)
    if (!r.ok) throw new Error(`Failed to load image: ${r.status}`)
    const blob = await r.blob()
    dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('Failed to read image'))
      reader.readAsDataURL(blob)
    })
  }

  const outputUrl = await runPrediction(key, dataUrl, style, onProgress)
  const imgRes = await fetch(outputUrl)
  if (!imgRes.ok) throw new Error(`Failed to fetch result image: ${imgRes.status}`)
  const resultBlob = await imgRes.blob()
  return URL.createObjectURL(resultBlob)
}

/**
 * Check if anime conversion is available for the given backend.
 * Local: always true when in browser. Replicate: requires API key.
 */
export function isAnimeConversionAvailable(apiKey?: string, backend: AnimeBackend = 'local'): boolean {
  if (backend === 'local') return isLocalAnimeAvailable()
  return !!getApiKey(apiKey)
}

export { isLocalAnimeAvailable } from './animeConversionLocal'
