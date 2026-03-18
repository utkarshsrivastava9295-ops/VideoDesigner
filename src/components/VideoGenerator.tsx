import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { FormData } from '../App'
import { renderVideoOfflineWebm } from '../lib/offlineVideoRenderer'
import { renderVideoWebCodecs } from '../lib/webcodecsVideoRenderer'
import { recordVideoRealtimeWebm } from '../lib/realtimeVideoRecorder'

type Props = {
  form: FormData
  onComplete: (blob: Blob) => void
  onCancel: () => void
}

export function VideoGenerator({ form, onComplete, onCancel }: Props) {
  const [progress, setProgress] = useState(0)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [encoderInfo, setEncoderInfo] = useState<{ acceleration: string; codec: string } | null>(null)
  const [gpuInfo, setGpuInfo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorDetail, setErrorDetail] = useState<string | null>(null)
  const [durationFromAudio, setDurationFromAudio] = useState(false)
  const cancelled = useRef(false)

  useEffect(() => {
    cancelled.current = false
    setError(null)
    setErrorDetail(null)
    setProgress(0)
    setStatusMessage(null)
    setEncoderInfo(null)
    setDurationFromAudio(false)

    async function run() {
      const { checkGpuAvailable } = await import('../lib/gpuDetection')
      const gpu = await checkGpuAvailable()
      setGpuInfo(gpu.info)
      console.log('[VideoGenerator] GPU:', gpu.available ? 'available' : 'not available', '—', gpu.info)
      try {
        const blob =
          form.exportMethod === 'record'
            ? await recordVideoRealtimeWebm(form, {
                onProgress: (p) => setProgress(Math.max(0, Math.min(100, p))),
                onStatus: (msg) => setStatusMessage(msg),
                onDurationSource: (src) => setDurationFromAudio(src === 'audio'),
                isCancelled: () => cancelled.current,
              })
            : form.renderEncoder === 'webcodecs'
              ? await renderVideoWebCodecs(form, {
                  onProgress: (p) => setProgress(Math.max(0, Math.min(100, p))),
                  onStatus: (msg) => setStatusMessage(msg),
                  onEncoderInfo: (info) => setEncoderInfo(info),
                  isCancelled: () => cancelled.current,
                })
              : await renderVideoOfflineWebm(form, {
                  onProgress: (p) => setProgress(Math.max(0, Math.min(100, p))),
                  onStatus: (msg) => setStatusMessage(msg),
                  isCancelled: () => cancelled.current,
                })
        if (cancelled.current) return
        onComplete(blob)
      } catch (err) {
        if (cancelled.current) return
        console.error('[VideoGenerator Error]', err)
        let msg: string
        let detail: string = ''
        if (err instanceof Error) {
          if (err.message === 'cancelled') return
          msg = err.message
          detail = err.stack || ''
        } else if (typeof err === 'string') {
          msg = err
        } else {
          try { msg = JSON.stringify(err) } catch { msg = String(err) }
        }
        setError(msg)
        setErrorDetail(detail)
      }
    }

    run()
    return () => {
      cancelled.current = true
    }
  }, [form.mainMedia, form.slideshowSecondsPerSlide, form.slideshowTransition, form.slideshowRandomOrder, form.videoAnimation, form.faceNodAnimation, form.convertToAnime, form.animeBackend, form.replicateApiKey, form.localWhisperUrl, form.audioFile, form.audioTrimStart, form.audioTrimEnd, form.videoFile, form.title, form.artist, form.album, form.lyrics, form.includeLyrics, form.lyricFile, form.lyricFileFormat, form.resolution, form.videoOrientation, form.preferGpu, form.durationSeconds, form.fps, form.style, form.visualizer, form.visualizerSize, form.visualizerPosition, form.lyricPosition, form.useLyricStyleOverrides, form.lyricStyleOverrides, form.visualizerPlacement, form.backgroundEffect, form.imageOpacityWithEffect, form.frontImageOpacityWhenVideo, form.instrumental, form.cardStyle, form.cardAutoHide, form.cardAutoHideSeconds, form.loopMainVideoToAudio, form.convertMp4InputToWebm, form.exportMethod, form.renderEncoder, form.outputFormat, onComplete])

  const durationHint = form.audioFile && durationFromAudio ? '(from audio)' : `${form.durationSeconds || 60}s`

  return (
    <motion.div
      key="generating"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-8"
    >
      {error ? (
        <div className="text-left">
          <p className="text-red-400 font-semibold mb-2">Render failed</p>
          <pre className="text-red-300 text-xs bg-black/30 rounded-lg p-3 mb-3 overflow-auto max-h-48 whitespace-pre-wrap break-all">{error}</pre>
          {errorDetail && (
            <details className="mb-3">
              <summary className="text-slate-400 text-xs cursor-pointer hover:text-white">Stack trace</summary>
              <pre className="text-slate-400 text-xs bg-black/20 rounded p-2 mt-1 overflow-auto max-h-32 whitespace-pre-wrap break-all">{errorDetail}</pre>
            </details>
          )}
          <button
            onClick={onCancel}
            className="px-6 py-2 rounded-xl bg-white/10 hover:bg-white/20 transition"
          >
            Back
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-300 font-medium">Generating your video</span>
            <span className="text-violet-400 font-mono text-sm">
              {Math.round(progress)}% · {form.resolution === '4k' ? '4K' : form.resolution === '720p' ? '720p' : '1080p'} {form.videoOrientation}
              {encoderInfo && (
                <span className="ml-2 text-emerald-400/90 text-xs" title={encoderInfo.codec}>
                  ({encoderInfo.acceleration})
                </span>
              )}
            </span>
          </div>
          <div className="h-3 rounded-full bg-white/10 overflow-hidden mb-6">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
              style={{ maxWidth: '100%' }}
            />
          </div>
          <p className="text-slate-500 text-sm mb-6">
            {statusMessage
              ? `${statusMessage} — ${Math.round(progress)}%`
              : form.exportMethod === 'record'
                ? `Recording ${durationHint} at ${form.fps} fps — ${Math.round(progress)}%`
                : `Rendering at ${form.fps} fps — ${Math.round(progress)}%`}
            {gpuInfo && (
              <span className="block mt-1 text-slate-600 text-xs" title={gpuInfo}>
                {gpuInfo}
              </span>
            )}
          </p>
          <button
            onClick={onCancel}
            className="px-6 py-2 rounded-xl border border-white/20 text-slate-400 hover:text-white hover:border-white/40 transition"
          >
            Cancel
          </button>
        </>
      )}
    </motion.div>
  )
}
