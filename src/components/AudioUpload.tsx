import { useCallback } from 'react'
import { motion } from 'framer-motion'

type Props = {
  audioFile: File | null
  onSelect: (file: File | null) => void
}

export function AudioUpload({ audioFile, onSelect }: Props) {
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
      transition={{ delay: 0.12 }}
      className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden"
    >
      <div className="p-4">
        <h3 className="text-lg font-semibold text-slate-200 flex items-center gap-2 mb-3">
          <span className="text-pink-400">♫</span> Audio (optional)
        </h3>
        <p className="text-slate-500 text-sm mb-3">
          Add a track to set video length from the song and burn audio into the video.
        </p>
        <div
          className="relative border-2 border-dashed border-violet-500/30 rounded-xl p-6 transition-colors hover:border-violet-500/50 hover:bg-violet-500/5"
          onClick={() => document.getElementById('audio-input')?.click()}
        >
          <input
            id="audio-input"
            type="file"
            accept="audio/*"
            onChange={handleFileInput}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          {!audioFile ? (
            <div className="text-center text-slate-400">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-violet-500/20 text-violet-400 mb-3">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              </div>
              <p className="font-medium text-slate-300">Click to choose an audio file</p>
              <p className="text-sm mt-1">MP3, WAV, OGG, M4A</p>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-lg bg-violet-500/20 flex items-center justify-center text-violet-400 shrink-0">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-slate-200 truncate">{audioFile.name}</p>
                  <p className="text-sm text-slate-500">
                    {(audioFile.size / 1024).toFixed(1)} KB
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
