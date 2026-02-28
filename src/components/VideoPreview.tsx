import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

type Props = {
  blob: Blob
  onReset: () => void
}

export function VideoPreview({ blob, onReset }: Props) {
  const [downloaded, setDownloaded] = useState(false)
  const url = URL.createObjectURL(blob)
  useEffect(() => () => URL.revokeObjectURL(url), [url])

  const handleDownload = () => {
    const a = document.createElement('a')
    a.href = url
    a.download = `music-video-${Date.now()}.webm`
    a.click()
    setDownloaded(true)
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
          className="w-full h-full object-contain"
        />
      </div>
      <div className="p-6 flex flex-wrap gap-3">
        <button
          onClick={handleDownload}
          className="px-6 py-3 rounded-xl font-medium bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:shadow-lg hover:shadow-violet-500/30 transition"
        >
          {downloaded ? 'Downloaded' : 'Download video'}
        </button>
        <button
          onClick={onReset}
          className="px-6 py-3 rounded-xl font-medium border border-white/20 text-slate-300 hover:bg-white/10 hover:text-white transition"
        >
          Create another
        </button>
      </div>
      <p className="px-6 pb-4 text-slate-500 text-sm">
        Video is in WebM format. Use VLC or Chrome to play; you can convert to MP4 with online tools if needed.
      </p>
    </motion.div>
  )
}
