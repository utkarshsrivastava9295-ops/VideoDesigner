/**
 * Frame-accurate video seek for rendering.
 * Some videos (certain codecs/formats) may not seek reliably – consider re-encoding to H.264/WebM.
 */

const SEEK_TOLERANCE = 0.02
const SEEK_TIMEOUT_MS = 12000

export async function seekVideo(video: HTMLVideoElement, tSeconds: number): Promise<void> {
  const duration = video.duration
  if (!Number.isFinite(duration) || duration <= 0) {
    console.warn('[videoSeek] Video duration not ready:', duration)
    return
  }
  const target = Math.max(0, Math.min(duration, tSeconds))
  if (Math.abs((video.currentTime ?? 0) - target) < SEEK_TOLERANCE) return

  // Skip if video is already in error state
  if (video.error) {
    throw new Error(`Video error before seek: ${video.error.message || `MediaError ${video.error.code}`}`)
  }

  await new Promise<void>((resolve, reject) => {
    let resolved = false
    const done = () => {
      if (resolved) return
      resolved = true
      cleanup()
      resolve()
    }
    const onError = () => {
      if (resolved) return
      resolved = true
      cleanup()
      const err = video.error
      const msg = err?.message || (err?.code != null ? `MediaError ${err.code} (decode/format issue)` : 'Video seek failed')
      reject(new Error(msg))
    }
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError as EventListener)
      clearTimeout(timeout)
    }
    const onSeeked = () => done()
    const timeout = setTimeout(() => {
      if (resolved) return
      resolved = true
      cleanup()
      reject(new Error('Video seek timed out – try a shorter clip or re-encode the video'))
    }, SEEK_TIMEOUT_MS)

    video.addEventListener('seeked', onSeeked)
    video.addEventListener('error', onError as EventListener)
    video.currentTime = target
  })
}
