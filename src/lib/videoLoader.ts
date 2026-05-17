import { seekVideo } from './videoSeek'

const HIDDEN_VIDEO_STYLE =
  'position:fixed;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none'

/** Check that the browser can decode and draw this file (not just play audio). */
export async function probeVideoCanvasDecodable(
  blob: Blob,
  isCancelled?: () => boolean
): Promise<boolean> {
  const url = URL.createObjectURL(blob)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.src = url
  video.style.cssText = HIDDEN_VIDEO_STYLE
  document.body.appendChild(video)
  try {
    if (isCancelled?.()) throw new Error('cancelled')
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve()
      video.onerror = () => reject(new Error('Video failed to load during probe'))
      video.load()
    })
    const dur = video.duration
    if (Number.isFinite(dur) && dur > 0) {
      await seekVideo(video, Math.min(0.25, dur * 0.05))
    }
    if (video.videoWidth <= 0 || video.videoHeight <= 0) return false
    const canvas = document.createElement('canvas')
    canvas.width = 8
    canvas.height = 8
    const ctx = canvas.getContext('2d')
    if (!ctx) return false
    ctx.drawImage(video, 0, 0, 8, 8)
    return true
  } catch {
    return false
  } finally {
    detachRenderVideo(video)
    URL.revokeObjectURL(url)
  }
}

/** Mount off-screen so Chromium decodes frames for canvas + WebCodecs. */
export async function attachVideoForRender(
  blob: Blob,
  opts: { muted?: boolean; loop?: boolean } = {}
): Promise<{ video: HTMLVideoElement; objectUrl: string }> {
  const objectUrl = URL.createObjectURL(blob)
  const video = document.createElement('video')
  video.src = objectUrl
  video.muted = opts.muted ?? true
  video.loop = opts.loop ?? false
  video.playsInline = true
  video.preload = 'auto'
  video.setAttribute('playsinline', '')
  video.style.cssText = HIDDEN_VIDEO_STYLE
  document.body.appendChild(video)

  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve()
    video.onerror = () => reject(new Error('Video failed to load'))
    video.load()
  })

  if (Number.isFinite(video.duration) && video.duration > 0) {
    await seekVideo(video, 0)
  }

  if (video.videoWidth <= 0 || video.videoHeight <= 0) {
    detachRenderVideo(video)
    URL.revokeObjectURL(objectUrl)
    throw new Error(
      'This video has no decodable picture (audio only). Enable “Convert MP4 inputs to WebM” or re-download the clip.'
    )
  }

  return { video, objectUrl }
}

export function detachRenderVideo(video: HTMLVideoElement | null | undefined): void {
  if (!video) return
  try {
    video.pause()
    video.removeAttribute('src')
    video.load()
    if (video.parentNode) video.parentNode.removeChild(video)
  } catch {
    // ignore
  }
}
