import type { FormData, VideoOrientationId } from '../App'
import { drawFrame, loadImage, SLIDESHOW_TRANSITION_IDS } from './canvasRenderer'
import { detectFaceInImage, detectFacesInImages, type FaceBox } from './faceDetection'
import { convertImageToAnime, isAnimeConversionAvailable } from './animeConversion'

let ffmpegSingleton: import('@ffmpeg/ffmpeg').FFmpeg | null = null
let ffmpegLoadPromise: Promise<import('@ffmpeg/ffmpeg').FFmpeg> | null = null

async function getFFmpeg() {
  if (ffmpegSingleton && ffmpegSingleton.loaded) {
    return ffmpegSingleton
  }
  if (ffmpegLoadPromise) {
    return ffmpegLoadPromise
  }
  ffmpegLoadPromise = (async () => {
    const mod = await import('@ffmpeg/ffmpeg')
    const { FFmpeg } = mod
    const ffmpeg = new FFmpeg()
    await ffmpeg.load()
    ffmpegSingleton = ffmpeg
    return ffmpeg
  })()
  return ffmpegLoadPromise
}

async function fetchFile(data: Blob | File): Promise<Uint8Array> {
  const ab = await data.arrayBuffer()
  return new Uint8Array(ab)
}

function getOutputDimensions(
  resolution: '720p' | '1080p' | '4k',
  orientation: VideoOrientationId
): { w: number; h: number } {
  const landscape: Record<string, { w: number; h: number }> = {
    '720': { w: 1280, h: 720 },
    '1080': { w: 1920, h: 1080 },
    '4k': { w: 3840, h: 2160 },
  }
  const res = resolution === '4k' ? '4k' : resolution === '720p' ? '720' : '1080'
  const base = landscape[res]
  switch (orientation) {
    case '16:9':
      return { w: base.w, h: base.h }
    case '9:16':
      return { w: base.h, h: base.w }
    case '1:1': {
      const s = Math.min(base.w, base.h)
      return { w: s, h: s }
    }
    case '4:5': {
      const h = base.h
      const w = Math.round((h * 4) / 5)
      return { w, h }
    }
    default:
      return { w: base.w, h: base.h }
  }
}

async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  const ab = await blob.arrayBuffer()
  return new Uint8Array(ab)
}

async function seekVideo(video: HTMLVideoElement, tSeconds: number) {
  const target = Math.max(0, Math.min(video.duration || 0, tSeconds))
  if (!Number.isFinite(target)) return
  if (Math.abs((video.currentTime ?? 0) - target) < 0.01) return
  await new Promise<void>((resolve, reject) => {
    const onSeeked = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('Video seek failed'))
    }
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError as EventListener)
      clearTimeout(timeout)
    }
    const timeout = setTimeout(() => {
      cleanup()
      resolve()
    }, 8000)
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('error', onError as EventListener)
    video.currentTime = target
  })
}

export type OfflineRenderCallbacks = {
  onProgress?: (percent: number) => void
  onStatus?: (message: string | null) => void
  isCancelled?: () => boolean
}

/** Max frames in FFmpeg's virtual FS at once. VP8 uses less memory than VP9. */
const MAX_FRAMES_BY_RESOLUTION: Record<string, number> = {
  '720p': 150,
  '1080p': 90,
  '4k': 45,
}

export async function renderVideoOfflineWebm(form: FormData, cb: OfflineRenderCallbacks = {}): Promise<Blob> {
  const { onProgress, onStatus, isCancelled } = cb
  const cancelled = () => (typeof isCancelled === 'function' ? isCancelled() : false)

  if (form.convertToAnime && !isAnimeConversionAvailable(form.replicateApiKey, form.animeBackend)) {
    throw new Error(
      form.animeBackend === 'replicate'
        ? 'Anime conversion (Replicate) requires an API key. Enter it in Anime conversion (AI) or set VITE_REPLICATE_API_TOKEN.'
        : 'Local anime conversion is not available in this environment.'
    )
  }

  const { w, h } = getOutputDimensions(form.resolution, form.videoOrientation)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = form.preferGpu
    ? (canvas.getContext('2d', { alpha: false, willReadFrequently: false }) ?? canvas.getContext('2d'))
    : canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')

  let durationMs = (form.durationSeconds || 60) * 1000
  let audioTrimStart = 0
  let audioTrimEnd = 0
  if (form.audioFile) {
    try {
      const arrayBuffer = await form.audioFile.arrayBuffer()
      const DecodeCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const decodeCtx = new DecodeCtx()
      const audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer.slice(0))
      await decodeCtx.close()
      const fullDurationSec = audioBuffer.duration
      audioTrimStart = Math.max(0, Math.min(form.audioTrimStart || 0, fullDurationSec - 0.5))
      audioTrimEnd = (form.audioTrimEnd || 0) > 0 ? Math.min(form.audioTrimEnd, fullDurationSec) : fullDurationSec
      if (audioTrimEnd <= audioTrimStart) audioTrimEnd = fullDurationSec
      durationMs = Math.round((audioTrimEnd - audioTrimStart) * 1000)
    } catch {
      throw new Error('Could not load or decode the audio file.')
    }
  }

  let image: HTMLImageElement | null = null
  let slideshowImages: HTMLImageElement[] = []
  let faceBox: FaceBox | null = null
  let slideshowFaceBoxes: (FaceBox | null)[] = []
  let convertedAnimeUrls: string[] = []
  let animeKeyframes: HTMLImageElement[] = []

  let backgroundVideo: HTMLVideoElement | null = null
  let backgroundVideoUrl: string | null = null
  let frontVideo: HTMLVideoElement | null = null
  let frontVideoUrl: string | null = null
  let mainVideoDurationMs: number | null = null

  try {
    if (form.mainMedia?.type === 'image') {
      let imageUrl = form.mainMedia.preview
      if (form.convertToAnime) {
        onStatus?.('Converting image to anime…')
        const convertedUrl = await convertImageToAnime(imageUrl, form.replicateApiKey, undefined, (msg) => onStatus?.(msg), form.animeBackend)
        convertedAnimeUrls.push(convertedUrl)
        imageUrl = convertedUrl
      }
      image = await loadImage(imageUrl)
      if (form.faceNodAnimation && image) faceBox = await detectFaceInImage(image)
    }

    if (form.mainMedia?.type === 'slideshow' && form.mainMedia.files.length > 0) {
      let urls = form.mainMedia.files.map((f) => f.preview)
      if (form.convertToAnime) {
        for (let i = 0; i < urls.length; i++) {
          if (cancelled()) throw new Error('cancelled')
          onStatus?.(`Converting slide ${i + 1}/${urls.length} to anime…`)
          const converted = await convertImageToAnime(urls[i], form.replicateApiKey, undefined, (msg) => onStatus?.(msg), form.animeBackend)
          convertedAnimeUrls.push(converted)
          urls[i] = converted
        }
      }
      slideshowImages = await Promise.all(urls.map((url) => loadImage(url)))
      if (form.slideshowRandomOrder && slideshowImages.length > 1) {
        for (let i = slideshowImages.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[slideshowImages[i], slideshowImages[j]] = [slideshowImages[j], slideshowImages[i]]
        }
      }
      if (form.faceNodAnimation && slideshowImages.length > 0) {
        slideshowFaceBoxes = await detectFacesInImages(slideshowImages)
      }
    }

    if (form.mainMedia?.type === 'video') {
      frontVideoUrl = URL.createObjectURL(form.mainMedia.file)
      frontVideo = document.createElement('video')
      frontVideo.src = frontVideoUrl
      frontVideo.muted = true
      frontVideo.playsInline = true
      frontVideo.preload = 'auto'
      frontVideo.setAttribute('playsinline', '')
      await new Promise<void>((resolve, reject) => {
        frontVideo!.onloadedmetadata = () => resolve()
        frontVideo!.onerror = () => reject(new Error('Video failed to load'))
        frontVideo!.load()
      })
      if (frontVideo.duration != null && isFinite(frontVideo.duration)) {
        mainVideoDurationMs = Math.round(frontVideo.duration * 1000)
        if (!(form.loopMainVideoToAudio && form.audioFile)) {
          durationMs = Math.min(durationMs, mainVideoDurationMs)
        }
      }
      if (form.convertToAnime && frontVideo) {
        const numFrames = Math.max(1, Math.ceil(durationMs / 1000))
        const sampleCanvas = document.createElement('canvas')
        sampleCanvas.width = Math.max(1, frontVideo.videoWidth || 1)
        sampleCanvas.height = Math.max(1, frontVideo.videoHeight || 1)
        const sampleCtx = sampleCanvas.getContext('2d')
        if (!sampleCtx) throw new Error('Canvas 2d not available')
        for (let k = 0; k < numFrames; k++) {
          if (cancelled()) throw new Error('cancelled')
          const t = (((k * 1000) % Math.max(1, frontVideo.duration * 1000)) / 1000) || 0
          onStatus?.(`Converting video to anime… ${k + 1}/${numFrames}`)
          await seekVideo(frontVideo, t)
          sampleCtx.drawImage(frontVideo, 0, 0)
          const dataUrl = sampleCanvas.toDataURL('image/jpeg', 0.92)
          const convertedUrl = await convertImageToAnime(dataUrl, form.replicateApiKey, undefined, (msg) => onStatus?.(msg), form.animeBackend)
          convertedAnimeUrls.push(convertedUrl)
          const img = await loadImage(convertedUrl)
          animeKeyframes.push(img)
        }
      }
    }

    if (form.videoFile) {
      backgroundVideoUrl = URL.createObjectURL(form.videoFile)
      backgroundVideo = document.createElement('video')
      backgroundVideo.src = backgroundVideoUrl
      backgroundVideo.loop = true
      backgroundVideo.muted = true
      backgroundVideo.playsInline = true
      backgroundVideo.preload = 'auto'
      backgroundVideo.setAttribute('playsinline', '')
      await new Promise<void>((resolve, reject) => {
        backgroundVideo!.onloadedmetadata = () => resolve()
        backgroundVideo!.onerror = () => reject(new Error('Video failed to load'))
        backgroundVideo!.load()
      })
    }

    const lyricsLines = form.includeLyrics && form.lyrics.trim()
      ? form.lyrics.trim().split(/\n+/).map((l) => l.trim()).filter(Boolean)
      : []

    const fps = form.fps
    const frameInterval = 1000 / fps
    const totalFrames = Math.max(1, Math.ceil(durationMs / frameInterval))

    console.log('[Render] all assets loaded, initialising FFmpeg…')
    const ffmpeg = await getFFmpeg()

    // Defer audio until mux – keep it out of memory during chunk encodes
    let audioInputName: string | null = null
    const hasAudio = !!(form.audioFile || (form.mainMedia?.type === 'video'))

    const vBitrate = form.resolution === '4k' ? '4M' : form.resolution === '720p' ? '1.5M' : '2.5M'

    const maxFramesPerChunk = MAX_FRAMES_BY_RESOLUTION[form.resolution] ?? 60

    // Chunked rendering to avoid "memory access out of bounds" – process frames in small batches
    const segmentNames: string[] = []
    const numChunks = Math.ceil(totalFrames / maxFramesPerChunk)
    const progressRenderRatio = 0.7

    for (let chunkIdx = 0; chunkIdx < numChunks; chunkIdx++) {
      if (cancelled()) throw new Error('cancelled')

      const frameStart = chunkIdx * maxFramesPerChunk
      const frameEnd = Math.min(frameStart + maxFramesPerChunk, totalFrames)
      const chunkFrames = frameEnd - frameStart

      const framesDir = `/frames_${chunkIdx}`
      try {
        await ffmpeg.createDir(framesDir)
      } catch {
        // ignore
      }

      const chunkProgressBase = (chunkIdx / numChunks) * progressRenderRatio * 100
      const chunkProgressSpan = (1 / numChunks) * progressRenderRatio * 100

      onStatus?.(`Rendering frames ${frameStart + 1}–${frameEnd} of ${totalFrames}…`)

      for (let i = frameStart; i < frameEnd; i++) {
        if (cancelled()) throw new Error('cancelled')
        const timeMs = Math.min(durationMs, Math.round(i * frameInterval))

        if (backgroundVideo && backgroundVideo.duration && isFinite(backgroundVideo.duration) && backgroundVideo.duration > 0) {
          const t = (timeMs / 1000) % backgroundVideo.duration
          await seekVideo(backgroundVideo, t)
        }
        if (frontVideo && frontVideo.duration && isFinite(frontVideo.duration) && frontVideo.duration > 0) {
          const t = (timeMs / 1000) % frontVideo.duration
          await seekVideo(frontVideo, t)
        }

        const slideDurationMs = form.slideshowSecondsPerSlide * 1000
        const transitionDurationMs = Math.min(1200, Math.max(400, slideDurationMs * 0.35))
        const timeInSlide = timeMs % slideDurationMs
        const slideshowCurrentIndex = slideshowImages.length > 0 ? Math.floor(timeMs / slideDurationMs) % slideshowImages.length : 0
        const slideshowTransitionProgress =
          slideshowImages.length > 0 && transitionDurationMs > 0
            ? Math.min(1, Math.max(0, (timeInSlide - (slideDurationMs - transitionDurationMs)) / transitionDurationMs))
            : 0
        const slideshowTransition =
          form.slideshowTransition === 'random' && slideshowImages.length > 0
            ? SLIDESHOW_TRANSITION_IDS[(slideshowCurrentIndex * 7 + 11) % SLIDESHOW_TRANSITION_IDS.length]
            : form.slideshowTransition
        const currentFaceBox =
          faceBox ??
          (slideshowImages.length > 0 ? (slideshowFaceBoxes[slideshowCurrentIndex % slideshowFaceBoxes.length] ?? null) : null)

        const pseudoBars = Array.from({ length: 48 }, (_, k) => 0.2 + 0.25 * Math.sin(timeMs / 130 + k * 0.18))
        const pseudoLevel = 0.18 + 0.08 * Math.sin(timeMs / 200)

        drawFrame(ctx, {
          width: w,
          height: h,
          timeMs,
          durationMs,
          style: form.style,
          image,
          frontVideo: frontVideo ?? undefined,
          title: form.title,
          artist: form.artist,
          album: form.album,
          lyricsLines,
          spectrumBars: pseudoBars,
          audioLevel: pseudoLevel,
          visualizer: form.visualizer,
          backgroundEffect: form.backgroundEffect,
          imageOpacityWithEffect: form.imageOpacityWithEffect,
          backgroundVideo: backgroundVideo ?? undefined,
          frontImageOpacityWhenVideo: form.frontImageOpacityWhenVideo,
          visualizerSize: form.visualizerSize,
          visualizerPosition: form.visualizerPosition,
          instrumental: form.instrumental,
          cardStyle: form.cardStyle,
          cardAutoHideSeconds: form.cardAutoHide ? form.cardAutoHideSeconds : undefined,
          slideshowImages: slideshowImages.length > 0 ? slideshowImages : undefined,
          slideshowCurrentIndex,
          slideshowTransitionProgress,
          slideshowTransition,
          slideshowSlideDurationMs: form.mainMedia?.type === 'slideshow' ? form.slideshowSecondsPerSlide * 1000 : undefined,
          videoAnimation: form.videoAnimation ?? 'kenBurns',
          faceBox: currentFaceBox,
          animeFrames: animeKeyframes.length > 0 ? { images: animeKeyframes, intervalMs: 1000 } : undefined,
        })

        const frameBlob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('Failed to encode frame'))),
            'image/jpeg',
            0.85
          )
        })
        const data = await blobToUint8Array(frameBlob)
        const localIdx = i - frameStart
        const name = `${framesDir}/frame${String(localIdx).padStart(6, '0')}.jpg`
        await ffmpeg.writeFile(name, data)

        if (localIdx % 3 === 0 || localIdx === chunkFrames - 1) {
          const p = chunkProgressBase + ((i - frameStart + 1) / chunkFrames) * chunkProgressSpan
          onProgress?.(Math.min(70, p))
        }
      }

      onStatus?.(`Encoding segment ${chunkIdx + 1}/${numChunks}…`)
      const segmentName = `/segment_${chunkIdx}.webm`
      segmentNames.push(segmentName)

      // VP9 causes "memory access out of bounds" in ffmpeg.wasm – use VP8
      const encodeArgs: string[] = [
        '-framerate', String(fps),
        '-i', `${framesDir}/frame%06d.jpg`,
        '-c:v', 'libvpx',
        '-b:v', vBitrate,
        '-qmin', '10',
        '-qmax', '42',
        '-pix_fmt', 'yuv420p',
        segmentName,
      ]

      const logLines: string[] = []
      const logCb = ({ message }: { message: string }) => { logLines.push(message) }
      ffmpeg.on('log', logCb)
      const ret = await ffmpeg.exec(encodeArgs)
      ffmpeg.off('log', logCb)
      if (ret !== 0) {
        const tail = logLines.slice(-8).join('\n')
        throw new Error(`FFmpeg encode failed (${ret}). Log:\n${tail || '(no log)'}`)
      }

      // Yield to event loop to allow GC
      await new Promise((r) => setTimeout(r, 0))

      // Free memory: delete frame files from this chunk
      try {
        const nodes = await ffmpeg.listDir(framesDir)
        for (const n of nodes) {
          if (!n.isDir && typeof n.name === 'string') {
            await ffmpeg.deleteFile(`${framesDir}/${n.name}`)
          }
        }
        await ffmpeg.deleteDir(framesDir)
      } catch {
        // ignore
      }
    }

    onProgress?.(90)

    const outputName = 'output.webm'
    let videoInputForMux = 'concat_video.webm'

    if (segmentNames.length === 1) {
      // Single segment – skip concat to avoid concat demuxer path resolution issues
      await ffmpeg.rename(segmentNames[0], videoInputForMux)
    } else {
      onStatus?.('Merging segments…')
      const concatList = segmentNames.map((s) => `file '${s}'`).join('\n')
      const concatData = new TextEncoder().encode(concatList)
      await ffmpeg.writeFile('concat.txt', concatData)
      const concatOut = 'concat_video.webm'

      const ret = await ffmpeg.exec([
        '-f', 'concat', '-safe', '0', '-i', 'concat.txt',
        '-c', 'copy', concatOut,
      ])
      if (ret !== 0) throw new Error(`FFmpeg concat failed with code ${ret}`)

      for (const s of segmentNames) await ffmpeg.deleteFile(s).catch(() => {})
      await ffmpeg.deleteFile('concat.txt').catch(() => {})
    }

    if (hasAudio) {
      onStatus?.('Adding audio…')
      audioInputName = form.audioFile ? 'audio_in' : 'main_video_in'
      const audioData =
        form.audioFile ? await fetchFile(form.audioFile)
        : form.mainMedia?.type === 'video' ? await fetchFile(form.mainMedia.file)
        : new Uint8Array(0)
      await ffmpeg.writeFile(audioInputName, audioData)

      const muxArgs: string[] = ['-i', videoInputForMux]
      if (form.audioFile) {
        muxArgs.push('-ss', String(audioTrimStart || 0), '-i', audioInputName)
      } else {
        muxArgs.push('-i', audioInputName)
      }
      muxArgs.push('-map', '0:v:0', '-map', '1:a:0?', '-c:v', 'copy', '-c:a', 'libvorbis', '-q:a', '4', '-shortest', outputName)
      const muxRet = await ffmpeg.exec(muxArgs)
      if (muxRet !== 0) throw new Error(`FFmpeg mux failed with code ${muxRet}`)
      await ffmpeg.deleteFile(videoInputForMux).catch(() => {})
    } else {
      await ffmpeg.rename(videoInputForMux, outputName)
    }

    const out = await ffmpeg.readFile(outputName)
    await ffmpeg.deleteFile(outputName).catch(() => {})
    if (hasAudio && audioInputName) await ffmpeg.deleteFile(audioInputName).catch(() => {})

    onProgress?.(100)
    onStatus?.(null)
    return new Blob([new Uint8Array(out as Uint8Array)], { type: 'video/webm' })
  } finally {
    try {
      if (backgroundVideoUrl) URL.revokeObjectURL(backgroundVideoUrl)
      if (frontVideoUrl) URL.revokeObjectURL(frontVideoUrl)
      convertedAnimeUrls.forEach((u) => URL.revokeObjectURL(u))
    } catch {
      // ignore
    }
  }
}

