import type { FormData, VideoOrientationId } from '../App'
import { drawFrame, loadImage, SLIDESHOW_TRANSITION_IDS } from './canvasRenderer'
import { detectFaceInImage, detectFacesInImages, type FaceBox } from './faceDetection'
import { convertImageToAnime, isAnimeConversionAvailable } from './animeConversion'
import { seekVideo } from './videoSeek'
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from 'webm-muxer'
import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from 'mp4-muxer'
import { convertWebmToMp4, ensureWebmVideo } from './offlineVideoRenderer'

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

export function isWebCodecsSupported(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined'
}

export type WebCodecsRenderCallbacks = {
  onProgress?: (percent: number) => void
  onStatus?: (message: string | null) => void
  onEncoderInfo?: (info: { acceleration: string; codec: string }) => void
  isCancelled?: () => boolean
}

export async function renderVideoWebCodecs(
  form: FormData,
  cb: WebCodecsRenderCallbacks = {}
): Promise<Blob> {
  const { onProgress, onStatus, onEncoderInfo, isCancelled } = cb
  const cancelled = () => (typeof isCancelled === 'function' ? isCancelled() : false)

  console.log('[WebCodecs] Starting render')
  onProgress?.(0)

  if (!isWebCodecsSupported()) {
    throw new Error('WebCodecs (VideoEncoder) is not supported in this browser. Use Chrome or Edge, or try FFmpeg encoder.')
  }

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
  let audioBuffer: AudioBuffer | null = null
  if (form.audioFile) {
    console.log('[WebCodecs] Loading audio…')
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
      console.log('[WebCodecs] Audio loaded, durationMs:', durationMs)
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

  try {
    if (form.mainMedia?.type === 'image') {
      console.log('[WebCodecs] Loading main image…')
      let imageUrl = form.mainMedia.preview
      if (form.convertToAnime) {
        onStatus?.('Converting image to anime…')
        const convertedUrl = await convertImageToAnime(imageUrl, form.replicateApiKey, undefined, (msg) => onStatus?.(msg), form.animeBackend)
        convertedAnimeUrls.push(convertedUrl)
        imageUrl = convertedUrl
      }
      image = await loadImage(imageUrl)
      if (form.faceNodAnimation && image) faceBox = await detectFaceInImage(image)
      console.log('[WebCodecs] Main image loaded')
    }

    if (form.mainMedia?.type === 'slideshow' && form.mainMedia.files.length > 0) {
      console.log('[WebCodecs] Loading slideshow…')
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
      console.log('[WebCodecs] Slideshow loaded, images:', slideshowImages.length)
    }

    if (form.mainMedia?.type === 'video') {
      console.log('[WebCodecs] Loading main video…')
      const mainVideoBlob = await ensureWebmVideo(form.mainMedia.file, { onStatus, isCancelled })
      frontVideoUrl = URL.createObjectURL(mainVideoBlob)
      frontVideo = document.createElement('video')
      frontVideo.src = frontVideoUrl
      frontVideo.muted = !!form.audioFile
      frontVideo.playsInline = true
      frontVideo.loop = true
      frontVideo.preload = 'auto'
      frontVideo.setAttribute('playsinline', '')
      await new Promise<void>((resolve, reject) => {
        frontVideo!.onloadeddata = () => resolve()
        frontVideo!.onerror = () => reject(new Error('Video failed to load'))
        frontVideo!.load()
      })
      if (frontVideo.duration != null && isFinite(frontVideo.duration)) {
        const mainVideoDurationMs = Math.round(frontVideo.duration * 1000)
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
        console.log('[WebCodecs] Anime keyframes created:', animeKeyframes.length)
      }
      console.log('[WebCodecs] Main video loaded')
    }

    if (form.videoFile) {
      console.log('[WebCodecs] Loading background video…')
      const bgVideoBlob = await ensureWebmVideo(form.videoFile, { onStatus, isCancelled })
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
      console.log('[WebCodecs] Background video loaded')
    }

    const lyricsLines = form.includeLyrics && form.lyrics.trim()
      ? form.lyrics.trim().split(/\n+/).map((l) => l.trim()).filter(Boolean)
      : []

    const fps = form.fps
    const frameInterval = 1000 / fps
    const totalFrames = Math.max(1, Math.ceil(durationMs / frameInterval))
    console.log('[WebCodecs] Assets ready. totalFrames:', totalFrames, 'fps:', fps, 'durationMs:', durationMs)

    const bitrate = form.resolution === '4k' ? 4_000_000 : form.resolution === '720p' ? 1_500_000 : 2_500_000

    const hasAudio = !!audioBuffer
    const wantsMp4 = form.outputFormat === 'mp4'
    console.log('[WebCodecs] Checking codec support… format:', form.outputFormat)

    const avcCodecs = [
      { codec: 'avc1.42E01E' as const, muxerCodec: 'avc' },
      { codec: 'avc1.4D401E' as const, muxerCodec: 'avc' },
      { codec: 'avc1.64001E' as const, muxerCodec: 'avc' },
    ]
    const webmCodecs = [
      { codec: 'vp09.00.10.08' as const, muxerCodec: 'V_VP9' },
      { codec: 'vp8' as const, muxerCodec: 'V_VP8' },
    ]
    const codecsToTry = wantsMp4 ? avcCodecs : webmCodecs
    const hwPrefs = ['prefer-hardware', 'no-preference', 'prefer-software'] as const
    let encoderConfig: VideoEncoderConfig | null = null
    let muxerVideoCodec = wantsMp4 ? 'avc' : 'V_VP8'
    let usedAcceleration = 'unknown'
    let useWebmThenConvert = false

    for (const hw of hwPrefs) {
      for (const { codec, muxerCodec } of codecsToTry) {
        const config: VideoEncoderConfig = {
          codec,
          width: w,
          height: h,
          bitrate,
          framerate: fps,
          hardwareAcceleration: hw,
        }
        const supported = await VideoEncoder.isConfigSupported(config)
        if (supported?.supported) {
          encoderConfig = config
          muxerVideoCodec = muxerCodec
          usedAcceleration = hw === 'prefer-hardware' ? 'GPU (prefer-hardware)' : hw === 'prefer-software' ? 'Software' : 'no-preference'
          break
        }
      }
      if (encoderConfig) break
    }

    if (!encoderConfig && wantsMp4) {
      useWebmThenConvert = true
      for (const hw of hwPrefs) {
        for (const { codec, muxerCodec } of webmCodecs) {
          const config: VideoEncoderConfig = {
            codec,
            width: w,
            height: h,
            bitrate,
            framerate: fps,
            hardwareAcceleration: hw,
          }
          const supported = await VideoEncoder.isConfigSupported(config)
          if (supported?.supported) {
            encoderConfig = config
            muxerVideoCodec = muxerCodec
            usedAcceleration = hw === 'prefer-hardware' ? 'GPU (prefer-hardware)' : hw === 'prefer-software' ? 'Software' : 'no-preference'
            break
          }
        }
        if (encoderConfig) break
      }
    }

    if (!encoderConfig) {
      throw new Error(
        wantsMp4
          ? 'H.264 and VP8/VP9 encoding are not supported. Try FFmpeg encoder.'
          : 'VP8/VP9 encoding is not supported in this browser. Try FFmpeg encoder or use Chrome/Edge.'
      )
    }
    const isMp4 = wantsMp4 && !useWebmThenConvert
    if (useWebmThenConvert) {
      console.log('[WebCodecs] H.264 not supported, will render to WebM then convert to MP4')
      onStatus?.('Rendering to WebM (H.264 unavailable), will convert to MP4…')
    }
    console.log('[WebCodecs] Using codec:', encoderConfig.codec, '| acceleration:', usedAcceleration)
    onEncoderInfo?.({ acceleration: usedAcceleration, codec: encoderConfig.codec })

    type MuxerLike = { addVideoChunk: (chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => void; addAudioChunk: (chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) => void; finalize: () => void }
    let muxer: MuxerLike
    let muxerTarget: { buffer: ArrayBuffer }

    if (isMp4) {
      const target = new Mp4Target()
      muxerTarget = target
      const mp4Opts: { target: InstanceType<typeof Mp4Target>; video: { codec: 'avc'; width: number; height: number; frameRate: number }; fastStart: 'in-memory'; firstTimestampBehavior: 'offset'; audio?: { codec: 'aac'; numberOfChannels: number; sampleRate: number } } = {
        target,
        video: { codec: 'avc', width: w, height: h, frameRate: fps },
        fastStart: 'in-memory',
        firstTimestampBehavior: 'offset',
      }
      if (hasAudio && audioBuffer) {
        mp4Opts.audio = { codec: 'aac', numberOfChannels: audioBuffer.numberOfChannels, sampleRate: audioBuffer.sampleRate }
      }
      muxer = new Mp4Muxer(mp4Opts) as MuxerLike
    } else {
      const target = new WebmTarget()
      muxerTarget = target
      muxer = new WebmMuxer({
        target,
        video: { codec: muxerVideoCodec, width: w, height: h, frameRate: fps },
        ...(hasAudio && audioBuffer ? { audio: { codec: 'A_OPUS', numberOfChannels: audioBuffer.numberOfChannels, sampleRate: audioBuffer.sampleRate } } : {}),
      })
    }

    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => console.error('[WebCodecs] VideoEncoder error:', e),
    })
    videoEncoder.configure(encoderConfig!)

    const frameDurationUs = (frameInterval * 1000) | 0
    const keyFrameInterval = Math.max(1, fps * 2)

    onStatus?.('Encoding video…')
    console.log('[WebCodecs] Encoding video frames 0–' + totalFrames)

    for (let i = 0; i < totalFrames; i++) {
      if (cancelled()) throw new Error('cancelled')

      const timeMs = Math.min(durationMs, Math.round(i * frameInterval))
      const timestampUs = i * frameDurationUs

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

      const frame = new VideoFrame(canvas, { timestamp: timestampUs, duration: frameDurationUs })
      videoEncoder.encode(frame, { keyFrame: i % keyFrameInterval === 0 })
      frame.close()

      if (i % 10 === 0 || i === totalFrames - 1) {
        const pct = Math.min(85, (i / totalFrames) * 85)
        onProgress?.(pct)
        if (i % 60 === 0 || i === totalFrames - 1) {
          console.log('[WebCodecs] Video frame', i + 1, '/', totalFrames, '—', Math.round(pct) + '%')
        }
      }
    }

    console.log('[WebCodecs] Flushing video encoder…')
    await videoEncoder.flush()
    videoEncoder.close()
    console.log('[WebCodecs] Video encode done')

    if (hasAudio && audioBuffer) {
      onStatus?.('Adding audio…')
      onProgress?.(90)
      console.log('[WebCodecs] Encoding audio…')

      const srcBuffer = audioBuffer
      const trimStart = audioTrimStart
      const trimEnd = audioTrimEnd

      const sampleRate = srcBuffer.sampleRate
      const numberOfChannels = srcBuffer.numberOfChannels
      const startSample = Math.floor(trimStart * sampleRate)
      const endSample = Math.min(Math.floor(trimEnd * sampleRate), srcBuffer.length)
      const totalSamples = endSample - startSample

      const useAac = isMp4
      const audioEncoderConfig: AudioEncoderConfig = useAac
        ? { codec: 'mp4a.40.2', sampleRate, numberOfChannels, bitrate: 128_000 }
        : { codec: 'opus', sampleRate, numberOfChannels, bitrate: 128_000 }

      const audioSupported = await AudioEncoder.isConfigSupported(audioEncoderConfig)
      if (audioSupported?.supported) {
        const frameSize = useAac ? 1024 : 960
        console.log('[WebCodecs]', useAac ? 'AAC' : 'Opus', 'supported, encoding', totalSamples, 'samples')
        const audioEncoder = new AudioEncoder({
          output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
          error: (e) => console.error('[WebCodecs] AudioEncoder error:', e),
        })
        audioEncoder.configure(audioEncoderConfig)

        for (let offset = 0; offset < totalSamples; offset += frameSize) {
          if (cancelled()) throw new Error('cancelled')
          const frameLength = Math.min(frameSize, totalSamples - offset)
          const data = new Float32Array(frameLength * numberOfChannels)
          for (let ch = 0; ch < numberOfChannels; ch++) {
            const channelData = srcBuffer.getChannelData(ch)
            const base = ch * frameLength
            for (let i = 0; i < frameLength; i++) {
              data[base + i] = channelData[startSample + offset + i]
            }
          }
          const timestamp = Math.round((offset / sampleRate) * 1_000_000)
          const audioData = new AudioData({
            format: 'f32-planar',
            sampleRate,
            numberOfFrames: frameLength,
            numberOfChannels,
            timestamp,
            data: data.buffer,
          })
          audioEncoder.encode(audioData)
          audioData.close()
        }
        await audioEncoder.flush()
        audioEncoder.close()
        console.log('[WebCodecs] Audio encode done')
      } else {
        console.log('[WebCodecs]', useAac ? 'AAC' : 'Opus', 'not supported, skipping audio')
      }
    }

    console.log('[WebCodecs] Finalizing muxer…')
    muxer.finalize()

    const buffer = muxerTarget.buffer
    if (!buffer) throw new Error('WebCodecs mux failed: no output')
    let resultBlob = new Blob([buffer], { type: isMp4 ? 'video/mp4' : 'video/webm' })

    if (useWebmThenConvert) {
      if (cancelled()) throw new Error('cancelled')
      resultBlob = await convertWebmToMp4(resultBlob, {
        onStatus: (msg) => onStatus?.(msg ?? 'Encoding video…'),
        isCancelled: () => cancelled(),
      })
    }

    onProgress?.(100)
    onStatus?.(null)
    console.log('[WebCodecs] Render complete')
    return resultBlob
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
