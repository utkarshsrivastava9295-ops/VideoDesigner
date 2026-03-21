/**
 * Frame-accurate video seek for rendering.
 * Some videos (certain codecs/formats) may not seek reliably – consider re-encoding to H.264/WebM.
 */

const SEEK_TOLERANCE = 0.02
const SEEK_TIMEOUT_MS = 12000
const RETRY_DELAY_MS = 300

/** Turn browser decode/pipeline errors into a helpful message. */
function formatVideoError(err: MediaError | null, context: string): string {
  if (!err) return `${context} (unknown error)`
  const raw = err.message || ''
  if (/PIPELINE_ERROR_DISCONNECTED|decode error|MEDIA_ERR_DECODE/i.test(raw)) {
    return `${context}. This video may use an unsupported codec or have encoding issues. Try re-encoding to H.264 (MP4) or VP9 (WebM) – or enable "Convert MP4 to WebM" in settings.`
  }
  if (err.code === 3 /* MEDIA_ERR_DECODE */ || err.code === 4 /* MEDIA_ERR_SRC_NOT_SUPPORTED */) {
    return `${context}. Unsupported codec or corrupt segment. Re-encode to H.264 or WebM.`
  }
  return `${context}: ${raw || `MediaError ${err.code}`}`
}

async function seekVideoOnce(video: HTMLVideoElement, target: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
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
      reject(new Error(formatVideoError(video.error, 'Video decode error during seek')))
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
      reject(new Error('Video seek timed out. Try a shorter clip or re-encode to H.264/WebM.'))
    }, SEEK_TIMEOUT_MS)

    video.addEventListener('seeked', onSeeked)
    video.addEventListener('error', onError as EventListener)
    video.currentTime = target
  })
}

export async function seekVideo(video: HTMLVideoElement, tSeconds: number): Promise<void> {
  const duration = video.duration
  if (!Number.isFinite(duration) || duration <= 0) {
    console.warn('[videoSeek] Video duration not ready:', duration)
    return
  }
  const target = Math.max(0, Math.min(duration, tSeconds))
  if (Math.abs((video.currentTime ?? 0) - target) < SEEK_TOLERANCE) return

  if (video.error) {
    throw new Error(formatVideoError(video.error, 'Video error before seek'))
  }

  try {
    await seekVideoOnce(video, target)
  } catch (e) {
    // Retry once for intermittent decode failures (some codecs fail on first seek)
    if (e instanceof Error && /decode|PIPELINE|MEDIA_ERR|disconnect/i.test(e.message)) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
      if (video.error) {
        throw new Error(formatVideoError(video.error, 'Video decode error – try re-encoding to H.264 or WebM'))
      }
      await seekVideoOnce(video, target)
    } else {
      throw e
    }
  }
}
