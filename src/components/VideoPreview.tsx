import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import JSZip from 'jszip'

async function getFFmpeg() {
  const mod = await import('@ffmpeg/ffmpeg')
  const { FFmpeg } = mod
  const ffmpeg = new FFmpeg()
  if (!ffmpeg.loaded) await ffmpeg.load()
  return { ffmpeg }
}

async function toU8(data: Blob): Promise<Uint8Array> {
  const ab = await data.arrayBuffer()
  return new Uint8Array(ab)
}

type Props = {
  blob: Blob
  onReset: () => void
}

export function VideoPreview({ blob, onReset }: Props) {
  const [downloaded, setDownloaded] = useState(false)
  const [partsCount, setPartsCount] = useState(2)
  const [splitting, setSplitting] = useState(false)
  const [splitProgress, setSplitProgress] = useState(0)
  const [splitError, setSplitError] = useState<string | null>(null)
  const [duration, setDuration] = useState<number | null>(null)
  const url = URL.createObjectURL(blob)
  useEffect(() => () => URL.revokeObjectURL(url), [url])

  const handleDownload = () => {
    const a = document.createElement('a')
    a.href = url
    a.download = `music-video-${Date.now()}.webm`
    a.click()
    setDownloaded(true)
  }

  const handleDownloadPartsZip = async () => {
    setSplitError(null)
    if (partsCount < 2) {
      setSplitError('Number of parts must be at least 2.')
      return
    }
    if (!duration || !Number.isFinite(duration) || duration <= 0) {
      setSplitError('Could not read video duration yet. Wait a moment and try again.')
      return
    }
    setSplitting(true)
    setSplitProgress(0)
    try {
      const { ffmpeg } = await getFFmpeg()
      const inputName = 'input.webm'
      await ffmpeg.writeFile(inputName, await toU8(blob))

      const zip = new JSZip()
      const totalSec = duration
      const basePartSec = totalSec / partsCount

      const logCb = ({ message }: { message: string }) => console.log('[ffmpeg split]', message)
      ffmpeg.on('log', logCb)

      for (let i = 0; i < partsCount; i++) {
        const start = basePartSec * i
        const partDuration = i === partsCount - 1 ? totalSec - start : basePartSec
        const outputName = `part-${i + 1}.webm`

        const progressCb = ({ progress }: { progress: number }) => {
          const p = Math.max(0, Math.min(1, progress))
          setSplitProgress(Math.round(((i + p) / partsCount) * 100))
        }
        ffmpeg.on('progress', progressCb)
        try {
          await ffmpeg.exec([
          '-ss',
          start.toFixed(3),
          '-i',
          inputName,
          '-t',
          partDuration.toFixed(3),
          '-c',
          'copy',
          outputName,
        ])
        } finally {
          ffmpeg.off('progress', progressCb)
        }
        const data = await ffmpeg.readFile(outputName)
        zip.file(outputName, data as Uint8Array)
        await ffmpeg.deleteFile(outputName)
      }

      ffmpeg.off('log', logCb)
      await ffmpeg.deleteFile(inputName)

      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const zipUrl = URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      a.href = zipUrl
      a.download = `music-video-parts-${Date.now()}.zip`
      a.click()
      URL.revokeObjectURL(zipUrl)
    } catch (err) {
      console.error(err)
      setSplitError('Failed to split video into parts. Please try again.')
    } finally {
      setSplitting(false)
    }
  }

  return (
    <motion.div
      key="preview"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden"
    >
      <div className="aspect-video bg-black">
        <video
          src={url}
          controls
          autoPlay
          loop
          muted
          playsInline
          onLoadedMetadata={(e) => {
            if (!Number.isNaN(e.currentTarget.duration)) {
              setDuration(e.currentTarget.duration)
            }
          }}
          className="w-full h-full object-contain"
        />
      </div>
      <div className="p-6 flex flex-wrap gap-3 items-center">
        <button
          onClick={handleDownload}
          className="px-6 py-3 rounded-xl font-medium bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:shadow-lg hover:shadow-violet-500/30 transition"
        >
          {downloaded ? 'Downloaded' : 'Download video'}
        </button>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">Split into</span>
          <input
            type="number"
            min={2}
            max={20}
            value={partsCount}
            onChange={(e) => {
              const v = Number(e.target.value)
              setPartsCount(!Number.isNaN(v) ? Math.max(2, Math.min(20, v)) : 2)
            }}
            className="w-16 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:border-violet-500/50 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="text-sm text-slate-400">parts</span>
        </div>
        <button
          onClick={handleDownloadPartsZip}
          disabled={splitting}
          className="px-6 py-3 rounded-xl font-medium border border-violet-500/60 text-violet-200 hover:bg-violet-500/20 hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {splitting ? `Preparing ZIP… (${splitProgress}%)` : 'Download parts (ZIP)'}
        </button>
        <button
          onClick={onReset}
          className="px-6 py-3 rounded-xl font-medium border border-white/20 text-slate-300 hover:bg-white/10 hover:text-white transition"
        >
          Create another
        </button>
      </div>
      <div className="px-6 pb-4 space-y-1">
        <p className="text-slate-500 text-sm">
          Video is in WebM format. Use VLC or Chrome to play; you can convert to MP4 with online tools if needed.
        </p>
        <p className="text-slate-500 text-xs">
          To download equal-length parts, choose how many pieces you want and click &quot;Download parts (ZIP)&quot;. This uses FFmpeg in the app, so it may take a bit longer the first time.
        </p>
        {splitError && (
          <p className="text-xs text-red-400">
            {splitError}
          </p>
        )}
      </div>
    </motion.div>
  )
}
