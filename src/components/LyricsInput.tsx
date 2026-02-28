import { motion } from 'framer-motion'

type Props = {
  lyrics: string
  includeLyrics: boolean
  onChange: (lyrics: string, includeLyrics: boolean) => void
}

export function LyricsInput({ lyrics, includeLyrics, onChange }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 space-y-4"
    >
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={includeLyrics}
          onChange={(e) => onChange(lyrics, e.target.checked)}
          className="w-5 h-5 rounded border-white/20 bg-white/5 text-violet-500 focus:ring-violet-500/50"
        />
        <span className="text-lg font-semibold text-slate-200 flex items-center gap-2">
          <span className="text-pink-400">♫</span> Show lyrics in video
        </span>
      </label>
      {includeLyrics && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="overflow-hidden"
        >
          <textarea
            value={lyrics}
            onChange={(e) => onChange(e.target.value, true)}
            placeholder="Paste lyrics here (one line per row). They'll appear in an animated frame."
            rows={6}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30 outline-none transition resize-y min-h-[120px]"
          />
        </motion.div>
      )}
    </motion.div>
  )
}
