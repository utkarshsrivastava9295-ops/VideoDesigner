import type { FormData, VideoOrientationId } from '../App'
import { drawFrame, loadImage, SLIDESHOW_TRANSITION_IDS } from './canvasRenderer'
import { detectFaceInImage, detectFacesInImages, type FaceBox } from './faceDetection'
import { convertImageToAnime, isAnimeConversionAvailable } from './animeConversion'
import { seekVideo } from './videoSeek'

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

function isWebmFile(file: File): boolean {
  return file.type === 'video/webm' || file.name.toLowerCase().endsWith('.webm')
}

function isMp4File(file: File): boolean {
  return file.type === 'video/mp4' || file.name.toLowerCase().endsWith('.mp4')
}

/** Detect format from file content (magic bytes) — more reliable than type/extension. */
async function detectVideoFormat(file: File): Promise<'webm' | 'mp4' | 'unknown'> {
  const buf = await file.slice(0, 12).arrayBuffer()
  const arr = new Uint8Array(buf)
  if (arr.length < 8) return 'unknown'
  // WebM/EBML: 0x1A 0x45 0xDF 0xA3
  if (arr[0] === 0x1a && arr[1] === 0x45 && arr[2] === 0xdf && arr[3] === 0xa3) return 'webm'
  // MP4: ftyp at offset 4
  if (arr[4] === 0x66 && arr[5] === 0x74 && arr[6] === 0x79 && arr[7] === 0x70) return 'mp4'
  return 'unknown'
}

export async function ensureWebmVideo(
  file: File,
  cb: { onStatus?: (msg: string | null) => void; isCancelled?: () => boolean; convertIfMp4?: boolean }
): Promise<Blob> {
  if (cb.convertIfMp4 === false) return file
  if (isWebmFile(file)) return file
  const format = await detectVideoFormat(file)
  if (format === 'webm') return file
  if (format !== 'mp4' && !isMp4File(file)) return file
  return convertMp4ToWebm(file, { onStatus: cb.onStatus, isCancelled: cb.isCancelled })
}

export type OfflineRenderCallbacks = {
  onProgress?: (percent: number) => void
  onStatus?: (message: string | null) => void
  isCancelled?: () => boolean
}

/** Convert MP4 blob to WebM (VP8/Vorbis) – avoids decode/seek errors with some MP4 files. */
export async function convertMp4ToWebm(
  mp4Blob: Blob,
  cb: { onStatus?: (msg: string | null) => void; isCancelled?: () => boolean } = {}
): Promise<Blob> {
  const { onStatus, isCancelled } = cb
  onStatus?.('Converting MP4 to WebM…')
  console.log('[FFmpeg] Converting MP4 to WebM (input)')
  const ffmpeg = await getFFmpeg()
  let lastPct = -1
  const onProgress = (e: { progress: number }) => {
    const pct = Math.min(99, Math.round(e.progress * 100))
    if (pct >= lastPct + 10 || pct >= 90) {
      lastPct = pct
      onStatus?.(`Converting MP4 to WebM… ${pct}%`)
    }
  }
  ffmpeg.on('progress', onProgress)
  try {
    const data = await blobToUint8Array(mp4Blob)
    await ffmpeg.writeFile('input.mp4', data)
    if (isCancelled?.()) throw new Error('Cancelled')
    const ret = await ffmpeg.exec([
      '-i', 'input.mp4',
      '-c:v', 'libvpx',
      '-c:a', 'libvorbis',
      '-q:a', '4',
      'output.webm',
    ])
    await ffmpeg.deleteFile('input.mp4').catch(() => {})
    if (ret !== 0) throw new Error('MP4 to WebM conversion failed')
    const out = await ffmpeg.readFile('output.webm')
    await ffmpeg.deleteFile('output.webm').catch(() => {})
    return new Blob([new Uint8Array(out as Uint8Array)], { type: 'video/webm' })
  } finally {
    ffmpeg.off('progress', onProgress)
  }
}

/** Convert WebM blob to MP4 (H.264/AAC) using FFmpeg. */
export async function convertWebmToMp4(
  webmBlob: Blob,
  cb: { onStatus?: (msg: string | null) => void; isCancelled?: () => boolean } = {}
): Promise<Blob> {
  const { onStatus } = cb
  onStatus?.('Converting WebM to MP4…')
  console.log('[FFmpeg] Converting WebM to MP4')
  const ffmpeg = await getFFmpeg()
  const data = await blobToUint8Array(webmBlob)
  await ffmpeg.writeFile('input.webm', data)
  const ret = await ffmpeg.exec([
    '-i', 'input.webm',
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-movflags', '+faststart',
    'output.mp4',
  ])
  await ffmpeg.deleteFile('input.webm').catch(() => {})
  if (ret !== 0) throw new Error('WebM to MP4 conversion failed')
  const out = await ffmpeg.readFile('output.mp4')
  await ffmpeg.deleteFile('output.mp4').catch(() => {})
  return new Blob([new Uint8Array(out as Uint8Array)], { type: 'video/mp4' })
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

  console.log('[FFmpeg] Starting render')
  onProgress?.(0)

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
    console.log('[FFmpeg] Loading audio…')
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
      console.log('[FFmpeg] Audio loaded, durationMs:', durationMs)
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
  let mainVideoBlobForAudio: Blob | null = null

  try {
    if (form.mainMedia?.type === 'image') {
      console.log('[FFmpeg] Loading main image…')
      let imageUrl = form.mainMedia.preview
      if (form.convertToAnime) {
        onStatus?.('Converting image to anime…')
        const convertedUrl = await convertImageToAnime(imageUrl, form.replicateApiKey, undefined, (msg) => onStatus?.(msg), form.animeBackend)
        convertedAnimeUrls.push(convertedUrl)
        imageUrl = convertedUrl
      }
      image = await loadImage(imageUrl)
      if (form.faceNodAnimation && image) faceBox = await detectFaceInImage(image)
      console.log('[FFmpeg] Main image loaded')
    }

    if (form.mainMedia?.type === 'slideshow' && form.mainMedia.files.length > 0) {
      console.log('[FFmpeg] Loading slideshow…')
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
      console.log('[FFmpeg] Slideshow loaded, images:', slideshowImages.length)
    }

    if (form.mainMedia?.type === 'video') {
      console.log('[FFmpeg] Loading main video…')
      mainVideoBlobForAudio = await ensureWebmVideo(form.mainMedia.file, { onStatus, isCancelled, convertIfMp4: form.convertMp4InputToWebm })
      frontVideoUrl = URL.createObjectURL(mainVideoBlobForAudio)
      frontVideo = document.createElement('video')
      frontVideo.src = frontVideoUrl
      frontVideo.muted = true
      frontVideo.playsInline = true
      frontVideo.preload = 'auto'
      frontVideo.setAttribute('playsinline', '')
      await new Promise<void>((resolve, reject) => {
        frontVideo!.onloadeddata = () => resolve()
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
        console.log('[FFmpeg] Anime keyframes created:', animeKeyframes.length)
      }
      console.log('[FFmpeg] Main video loaded')
    }

    if (form.videoFile) {
      console.log('[FFmpeg] Loading background video…')
      const bgVideoBlob = await ensureWebmVideo(form.videoFile, { onStatus, isCancelled, convertIfMp4: form.convertMp4InputToWebm })
      backgroundVideoUrl = URL.createObjectURL(bgVideoBlob)
      backgroundVideo = document.createElement('video')
      backgroundVideo.src = backgroundVideoUrl
      backgroundVideo.loop = true
      backgroundVideo.muted = true
      backgroundVideo.playsInline = true
      backgroundVideo.preload = 'auto'
      backgroundVideo.setAttribute('playsinline', '')
      await new Promise<void>((resolve, reject) => {
        backgroundVideo!.onloadeddata = () => resolve()
        backgroundVideo!.onerror = () => reject(new Error('Video failed to load'))
        backgroundVideo!.load()
      })
      console.log('[FFmpeg] Background video loaded')
    }

    const lyricsLines = form.includeLyrics && form.lyrics.trim()
      ? form.lyrics.trim().split(/\n+/).map((l) => l.trim()).filter(Boolean)
      : []

    const fps = form.fps
    const frameInterval = 1000 / fps
    const totalFrames = Math.max(1, Math.ceil(durationMs / frameInterval))
    console.log('[FFmpeg] Assets ready. totalFrames:', totalFrames, 'fps:', fps, 'durationMs:', durationMs)
    onProgress?.(2)
    console.log('[FFmpeg] Initialising FFmpeg…')
    const ffmpeg = await getFFmpeg()
    console.log('[FFmpeg] FFmpeg loaded')

    // Defer audio until mux – keep it out of memory during chunk encodes
    let audioInputName: string | null = null
    const hasAudio = !!(form.audioFile || (form.mainMedia?.type === 'video'))

    const vBitrate = form.resolution === '4k' ? '4M' : form.resolution === '720p' ? '1.5M' : '2.5M'

    const maxFramesPerChunk = MAX_FRAMES_BY_RESOLUTION[form.resolution] ?? 60

    // Single /frames dir – reuse to avoid createDir/deleteDir bugs with many chunks
    const framesDir = '/frames'
    try {
      await ffmpeg.createDir(framesDir)
    } catch {
      // ignore if exists
    }

    // Chunked rendering to avoid "memory access out of bounds" – process frames in small batches
    const segmentNames: string[] = []
    const numChunks = Math.ceil(totalFrames / maxFramesPerChunk)
    const progressRenderRatio = 0.7

    for (let chunkIdx = 0; chunkIdx < numChunks; chunkIdx++) {
      if (cancelled()) throw new Error('cancelled')

      console.log('[FFmpeg] Chunk', chunkIdx + 1, '/', numChunks)
      const frameStart = chunkIdx * maxFramesPerChunk
      const frameEnd = Math.min(frameStart + maxFramesPerChunk, totalFrames)
      const chunkFrames = frameEnd - frameStart

      // Clear previous chunk's frames from /frames
      try {
        const nodes = await ffmpeg.listDir(framesDir)
        for (const n of nodes) {
          if (!n.isDir && typeof n.name === 'string') {
            await ffmpeg.deleteFile(`${framesDir}/${n.name}`)
          }
        }
      } catch {
        // ignore
      }

      const chunkProgressBase = (chunkIdx / numChunks) * progressRenderRatio * 100
      const chunkProgressSpan = (1 / numChunks) * progressRenderRatio * 100

      onStatus?.(`Rendering frames ${frameStart + 1}–${frameEnd} of ${totalFrames}…`)

      for (let i = frameStart; i < frameEnd; i++) {
        if (cancelled()) throw new Error('cancelled')
        const timeMs = Math.min(durationMs, Math.round(i * frameInterval))

        const seeks: Promise<void>[] = []
        if (backgroundVideo?.duration && isFinite(backgroundVideo.duration) && backgroundVideo.duration > 0) {
          seeks.push(seekVideo(backgroundVideo, (timeMs / 1000) % backgroundVideo.duration))
        }
        if (frontVideo?.duration && isFinite(frontVideo.duration) && frontVideo.duration > 0) {
          seeks.push(seekVideo(frontVideo, (timeMs / 1000) % frontVideo.duration))
        }
        if (seeks.length > 0) await Promise.all(seeks)

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
          particleEffect: form.particleEffect,
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

      const ext = form.outputFormat === 'mp4' ? 'mp4' : 'webm'
      onStatus?.(`Encoding segment ${chunkIdx + 1}/${numChunks}…`)
      console.log('[FFmpeg] Encoding segment', chunkIdx + 1, '…')
      const segmentName = `/segment_${chunkIdx}.${ext}`
      segmentNames.push(segmentName)

      // Use concat demuxer with explicit file list – image2 frame%06d fails to find files in ffmpeg.wasm virtual FS
      const concatListPath = `/concat_${chunkIdx}.txt`
      const concatLines = Array.from({ length: chunkFrames }, (_, idx) =>
        `file '${framesDir}/frame${String(idx).padStart(6, '0')}.jpg'`
      )
      await ffmpeg.writeFile(concatListPath, new TextEncoder().encode(concatLines.join('\n')))

      const encodeArgs: string[] =
        form.outputFormat === 'mp4'
          ? [
              '-f', 'concat', '-safe', '0', '-i', concatListPath,
              '-r', String(fps),
              '-c:v', 'libx264',
              '-b:v', vBitrate,
              '-pix_fmt', 'yuv420p',
              '-movflags', '+faststart',
              segmentName,
            ]
          : [
              '-f', 'concat', '-safe', '0', '-i', concatListPath,
              '-r', String(fps),
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
      await ffmpeg.deleteFile(concatListPath).catch(() => {})
      console.log('[FFmpeg] Segment', chunkIdx + 1, 'done, ret=', ret)
      if (ret !== 0) {
        const tail = logLines.slice(-8).join('\n')
        throw new Error(`FFmpeg encode failed (${ret}). Log:\n${tail || '(no log)'}`)
      }

      // Yield to event loop to allow GC
      await new Promise((r) => setTimeout(r, 0))
    }

    onProgress?.(90)
    console.log('[FFmpeg] Merging segments…')

    const ext = form.outputFormat === 'mp4' ? 'mp4' : 'webm'
    const outputName = `output.${ext}`
    const videoInputForMux = `concat_video.${ext}`

    if (segmentNames.length === 1) {
      await ffmpeg.rename(segmentNames[0], videoInputForMux)
    } else {
      onStatus?.('Merging segments…')
      const concatList = segmentNames.map((s) => `file '${s}'`).join('\n')
      const concatData = new TextEncoder().encode(concatList)
      await ffmpeg.writeFile('concat.txt', concatData)

      const ret = await ffmpeg.exec([
        '-f', 'concat', '-safe', '0', '-i', 'concat.txt',
        '-c', 'copy', videoInputForMux,
      ])
      if (ret !== 0) throw new Error(`FFmpeg concat failed with code ${ret}`)

      for (const s of segmentNames) await ffmpeg.deleteFile(s).catch(() => {})
      await ffmpeg.deleteFile('concat.txt').catch(() => {})
    }

    if (hasAudio) {
      onStatus?.('Adding audio…')
      console.log('[FFmpeg] Muxing audio…')
      audioInputName = form.audioFile ? 'audio_in' : 'main_video_in'
      const audioData =
        form.audioFile ? await fetchFile(form.audioFile)
        : form.mainMedia?.type === 'video'
          ? await fetchFile(mainVideoBlobForAudio ?? form.mainMedia.file)
          : new Uint8Array(0)
      await ffmpeg.writeFile(audioInputName, audioData)

      const muxArgs: string[] = ['-i', videoInputForMux]
      if (form.audioFile) {
        muxArgs.push('-ss', String(audioTrimStart || 0), '-i', audioInputName)
      } else {
        muxArgs.push('-i', audioInputName)
      }
      const audioCodec = form.outputFormat === 'mp4' ? ['-c:a', 'aac', '-b:a', '128k'] : ['-c:a', 'libvorbis', '-q:a', '4']
      muxArgs.push('-map', '0:v:0', '-map', '1:a:0?', '-c:v', 'copy', ...audioCodec, '-shortest', outputName)
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
    console.log('[FFmpeg] Render complete')
    const mime = form.outputFormat === 'mp4' ? 'video/mp4' : 'video/webm'
    return new Blob([new Uint8Array(out as Uint8Array)], { type: mime })
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

