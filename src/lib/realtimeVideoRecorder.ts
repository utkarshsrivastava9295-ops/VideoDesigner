import type { FormData, VideoOrientationId } from '../App'
import { drawFrame, loadImage, SLIDESHOW_TRANSITION_IDS } from './canvasRenderer'
import { detectFaceInImage, detectFacesInImages, type FaceBox } from './faceDetection'
import { convertImageToAnime, isAnimeConversionAvailable } from './animeConversion'
import { ensureWebmVideo } from './offlineVideoRenderer'

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

export type RealtimeRecordCallbacks = {
  onProgress?: (percent: number) => void
  onStatus?: (message: string | null) => void
  onDurationSource?: (source: 'audio' | 'form') => void
  isCancelled?: () => boolean
}

export async function recordVideoRealtimeWebm(form: FormData, cb: RealtimeRecordCallbacks = {}): Promise<Blob> {
  const { onProgress, onStatus, onDurationSource, isCancelled } = cb
  const cancelled = () => (typeof isCancelled === 'function' ? isCancelled() : false)

  if (form.convertToAnime && !isAnimeConversionAvailable(form.replicateApiKey, form.animeBackend)) {
    throw new Error(
      form.animeBackend === 'replicate'
        ? 'Anime conversion (Replicate) requires an API key. Enter it in Anime conversion (AI) or set VITE_REPLICATE_API_TOKEN.'
        : 'Local anime conversion is not available in this environment.'
    )
  }

  if (!MediaRecorder.isTypeSupported('video/webm; codecs=vp9')) {
    throw new Error('WebM VP9 not supported in this browser. Try Chrome.')
  }

  const { w, h } = getOutputDimensions(form.resolution, form.videoOrientation)

  let durationMs = (form.durationSeconds || 60) * 1000
  let audioBuffer: AudioBuffer | null = null
  let audioTrimStart = 0
  let audioTrimEnd = 0
  if (form.audioFile) {
    try {
      const arrayBuffer = await form.audioFile.arrayBuffer()
      const DecodeCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const decodeCtx = new DecodeCtx()
      audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer.slice(0))
      await decodeCtx.close()
      const fullDurationSec = audioBuffer.duration
      audioTrimStart = Math.max(0, Math.min(form.audioTrimStart || 0, fullDurationSec - 0.5))
      audioTrimEnd = (form.audioTrimEnd || 0) > 0 ? Math.min(form.audioTrimEnd, fullDurationSec) : fullDurationSec
      if (audioTrimEnd <= audioTrimStart) audioTrimEnd = fullDurationSec
      durationMs = Math.round((audioTrimEnd - audioTrimStart) * 1000)
      onDurationSource?.('audio')
    } catch {
      throw new Error('Could not load or decode the audio file.')
    }
  } else {
    onDurationSource?.('form')
  }

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = form.preferGpu
    ? (canvas.getContext('2d', { alpha: false, willReadFrequently: false }) ?? canvas.getContext('2d'))
    : canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')

  let image: HTMLImageElement | null = null
  let slideshowImages: HTMLImageElement[] = []
  let faceBox: FaceBox | null = null
  let slideshowFaceBoxes: (FaceBox | null)[] = []
  let convertedAnimeUrls: string[] = []
  let animeKeyframes: HTMLImageElement[] = []

  let stream: MediaStream | null = null
  let audioCtx: AudioContext | null = null
  let backgroundVideo: HTMLVideoElement | null = null
  let videoObjectUrl: string | null = null
  let frontVideo: HTMLVideoElement | null = null
  let frontVideoObjectUrl: string | null = null

  const cleanup = () => {
    try {
      stream?.getTracks().forEach((t) => t.stop())
      audioCtx?.close()
    } catch {
      // ignore
    }
    try {
      if (backgroundVideo) {
        backgroundVideo.pause()
        backgroundVideo.removeAttribute('src')
        if (backgroundVideo.parentNode) backgroundVideo.parentNode.removeChild(backgroundVideo)
      }
      if (frontVideo) {
        frontVideo.pause()
        frontVideo.removeAttribute('src')
        if (frontVideo.parentNode) frontVideo.parentNode.removeChild(frontVideo)
      }
      if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl)
      if (frontVideoObjectUrl) URL.revokeObjectURL(frontVideoObjectUrl)
      convertedAnimeUrls.forEach((url) => URL.revokeObjectURL(url))
    } catch {
      // ignore
    }
  }

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

    let mainVideoDurationMs: number | null = null
    if (form.mainMedia?.type === 'video') {
      const mainVideoBlob = await ensureWebmVideo(form.mainMedia.file, { onStatus, isCancelled })
      frontVideoObjectUrl = URL.createObjectURL(mainVideoBlob)
      frontVideo = document.createElement('video')
      frontVideo.src = frontVideoObjectUrl
      frontVideo.muted = !!form.audioFile
      frontVideo.playsInline = true
      frontVideo.loop = true
      frontVideo.preload = 'auto'
      frontVideo.setAttribute('playsinline', '')
      await new Promise<void>((resolve, reject) => {
        frontVideo!.oncanplay = () => {
          frontVideo!.play().then(resolve).catch(reject)
        }
        frontVideo!.onerror = () => reject(new Error('Video failed to load'))
        frontVideo!.load()
      })
      frontVideo.style.position = 'fixed'
      frontVideo.style.left = '-9999px'
      frontVideo.style.width = '1px'
      frontVideo.style.height = '1px'
      frontVideo.style.opacity = '0'
      frontVideo.style.pointerEvents = 'none'
      document.body.appendChild(frontVideo)
      if (frontVideo.duration != null && isFinite(frontVideo.duration)) {
        mainVideoDurationMs = Math.round(frontVideo.duration * 1000)
        if (!(form.loopMainVideoToAudio && audioBuffer)) {
          durationMs = Math.min(durationMs, mainVideoDurationMs)
        }
      }
      if (form.convertToAnime && frontVideo) {
        const numFrames = Math.max(1, Math.ceil(durationMs / 1000))
        const sampleCanvas = document.createElement('canvas')
        sampleCanvas.width = frontVideo.videoWidth
        sampleCanvas.height = frontVideo.videoHeight
        const sampleCtx = sampleCanvas.getContext('2d')
        if (!sampleCtx) throw new Error('Canvas 2d not available')
        for (let k = 0; k < numFrames; k++) {
          if (cancelled()) throw new Error('cancelled')
          const t = ((k * 1000) % (frontVideo.duration * 1000)) / 1000
          onStatus?.(`Converting video to anime… ${k + 1}/${numFrames}`)
          frontVideo.currentTime = t
          await new Promise<void>((resolve) => {
            frontVideo!.onseeked = () => resolve()
          })
          sampleCtx.drawImage(frontVideo, 0, 0)
          const dataUrl = sampleCanvas.toDataURL('image/jpeg', 0.92)
          const convertedUrl = await convertImageToAnime(dataUrl, form.replicateApiKey, undefined, (msg) => onStatus?.(msg), form.animeBackend)
          convertedAnimeUrls.push(convertedUrl)
          const img = await loadImage(convertedUrl)
          animeKeyframes.push(img)
        }
        frontVideo.pause()
      }
    }

    if (form.videoFile) {
      const bgVideoBlob = await ensureWebmVideo(form.videoFile, { onStatus, isCancelled })
      videoObjectUrl = URL.createObjectURL(bgVideoBlob)
      backgroundVideo = document.createElement('video')
      backgroundVideo.src = videoObjectUrl
      backgroundVideo.loop = true
      backgroundVideo.muted = true
      backgroundVideo.playsInline = true
      backgroundVideo.preload = 'auto'
      backgroundVideo.setAttribute('playsinline', '')
      await new Promise<void>((resolve, reject) => {
        backgroundVideo!.oncanplay = () => {
          backgroundVideo!.play().then(resolve).catch(reject)
        }
        backgroundVideo!.onerror = () => reject(new Error('Video failed to load'))
        backgroundVideo!.load()
      })
      backgroundVideo.style.position = 'fixed'
      backgroundVideo.style.left = '-9999px'
      backgroundVideo.style.width = '1px'
      backgroundVideo.style.height = '1px'
      backgroundVideo.style.opacity = '0'
      backgroundVideo.style.pointerEvents = 'none'
      document.body.appendChild(backgroundVideo)
    }

    const lyricsLines = form.includeLyrics && form.lyrics.trim()
      ? form.lyrics.trim().split(/\n+/).map((l) => l.trim()).filter(Boolean)
      : []

    const fps = form.fps
    const videoStream = canvas.captureStream(0)
    const videoTrack = videoStream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void }

    let getSpectrumBars: (() => number[]) | null = null
    const useVideoAudio = !audioBuffer && frontVideo && form.mainMedia?.type === 'video'
    if (audioBuffer) {
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        audioCtx = new AudioCtx()
        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.75
        const dest = audioCtx.createMediaStreamDestination()
        const source = audioCtx.createBufferSource()
        source.buffer = audioBuffer
        source.connect(analyser)
        analyser.connect(dest)
        const audioPlayDuration = Math.min(audioTrimEnd - audioTrimStart, durationMs / 1000)
        source.start(0, audioTrimStart, audioPlayDuration)
        const frequencyData = new Uint8Array(analyser.frequencyBinCount)
        const NUM_BARS = 48
        getSpectrumBars = () => {
          analyser.getByteFrequencyData(frequencyData)
          const bars: number[] = []
          const step = Math.floor(frequencyData.length / NUM_BARS)
          for (let i = 0; i < NUM_BARS; i++) {
            let sum = 0
            for (let j = 0; j < step; j++) sum += frequencyData[i * step + j]
            bars.push(Math.min(1, (sum / step / 255) * 1.6))
          }
          return bars
        }
        stream = new MediaStream([...videoStream.getVideoTracks(), ...dest.stream.getAudioTracks()])
      } catch {
        stream = videoStream
      }
    } else if (useVideoAudio && frontVideo) {
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        audioCtx = new AudioCtx()
        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.75
        const dest = audioCtx.createMediaStreamDestination()
        const videoSource = audioCtx.createMediaElementSource(frontVideo)
        videoSource.connect(analyser)
        analyser.connect(dest)
        const frequencyData = new Uint8Array(analyser.frequencyBinCount)
        const NUM_BARS = 48
        getSpectrumBars = () => {
          analyser.getByteFrequencyData(frequencyData)
          const bars: number[] = []
          const step = Math.floor(frequencyData.length / NUM_BARS)
          for (let i = 0; i < NUM_BARS; i++) {
            let sum = 0
            for (let j = 0; j < step; j++) sum += frequencyData[i * step + j]
            bars.push(Math.min(1, (sum / step / 255) * 1.6))
          }
          return bars
        }
        stream = new MediaStream([...videoStream.getVideoTracks(), ...dest.stream.getAudioTracks()])
      } catch {
        stream = videoStream
      }
    } else {
      stream = videoStream
    }

    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm; codecs=vp9',
      videoBitsPerSecond: form.resolution === '4k' ? 16_000_000 : form.resolution === '720p' ? 5_000_000 : 8_000_000,
      audioBitsPerSecond: 128_000,
    })

    const chunks: Blob[] = []
    const blobPromise = new Promise<Blob>((resolve) => {
      mediaRecorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
      mediaRecorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }))
    })

    const timesliceMs = 100
    mediaRecorder.start(timesliceMs)

    const frameInterval = 1000 / fps
    let nextFrameTime = 0

    const intervalId = setInterval(() => {
      if (cancelled()) {
        clearInterval(intervalId)
        if (mediaRecorder.state === 'recording') mediaRecorder.stop()
        cleanup()
        return
      }
      if (nextFrameTime >= durationMs) {
        clearInterval(intervalId)
        if (mediaRecorder.state === 'recording') mediaRecorder.stop()
        cleanup()
        return
      }

      onProgress?.(Math.min(100, (nextFrameTime / durationMs) * 100))
      const spectrumBars = getSpectrumBars ? getSpectrumBars() : null
      const audioLevel = spectrumBars?.length ? spectrumBars.reduce((a, b) => a + b, 0) / spectrumBars.length : 0
      const timeMs = nextFrameTime

      // Do not seek background video — let it play and loop for smooth, continuous playback
      if (frontVideo && frontVideo.duration && isFinite(frontVideo.duration)) {
        const t = (timeMs / 1000) % frontVideo.duration
        if (Math.abs(frontVideo.currentTime - t) > 0.15) frontVideo.currentTime = t
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
        spectrumBars,
        audioLevel,
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

      if (typeof videoTrack?.requestFrame === 'function') videoTrack.requestFrame()
      nextFrameTime += frameInterval
    }, frameInterval)

    // render first frame immediately
    ;(() => {
      try {
        const spectrumBars = getSpectrumBars ? getSpectrumBars() : null
        const audioLevel = spectrumBars?.length ? spectrumBars.reduce((a, b) => a + b, 0) / spectrumBars.length : 0
        const timeMs = 0
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
          spectrumBars,
          audioLevel,
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
          slideshowCurrentIndex: 0,
          slideshowTransitionProgress: 0,
          slideshowTransition: form.slideshowTransition === 'random' ? 'fade' : form.slideshowTransition,
          slideshowSlideDurationMs: form.mainMedia?.type === 'slideshow' ? form.slideshowSecondsPerSlide * 1000 : undefined,
          videoAnimation: form.videoAnimation ?? 'kenBurns',
          faceBox,
          animeFrames: animeKeyframes.length > 0 ? { images: animeKeyframes, intervalMs: 1000 } : undefined,
        })
        if (typeof videoTrack?.requestFrame === 'function') videoTrack.requestFrame()
      } catch {
        // ignore
      }
    })()

    const out = await blobPromise
    if (cancelled()) throw new Error('cancelled')
    return out
  } finally {
    cleanup()
  }
}

