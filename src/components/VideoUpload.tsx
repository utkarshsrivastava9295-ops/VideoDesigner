import { useCallback } from 'react'
import { motion } from 'framer-motion'

type Props = {
  videoFile: File | null
  onSelect: (file: File | null) => void
}

export function VideoUpload({ videoFile, onSelect }: Props) {
  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      onSelect(file ?? null)
    },
    [onSelect]
  )

  const clear = useCallback(() => onSelect(null), [onSelect])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.115 }}
      className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden"
    >
      <div className="p-4">
        <h3 className="text-lg font-semibold text-slate-200 flex items-center gap-2 mb-3">
          <span className="text-cyan-400">▶</span> Background video (optional)
        </h3>
        <p className="text-slate-500 text-sm mb-3">
          Loop a video behind your image. Use the slider below to set how much the front image shows through.
        </p>
        <div
          className="relative border-2 border-dashed border-cyan-500/30 rounded-xl p-6 transition-colors hover:border-cyan-500/50 hover:bg-cyan-500/5"
          onClick={() => document.getElementById('background-video-input')?.click()}
        >
          <input
            id="background-video-input"
            type="file"
            accept="video/*"
            onChange={handleFileInput}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          {!videoFile ? (
            <div className="text-center text-slate-400">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-cyan-500/20 text-cyan-400 mb-3">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="font-medium text-slate-300">Click to choose a background video</p>
              <p className="text-sm mt-1">MP4, WebM, etc. Plays in a loop behind your image.</p>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-lg bg-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-slate-200 truncate">{videoFile.name}</p>
                  <p className="text-sm text-slate-500">
                    {(videoFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); clear() }}
                className="p-2 rounded-lg bg-white/10 text-slate-400 hover:bg-red-500/20 hover:text-red-400 transition shrink-0"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}
