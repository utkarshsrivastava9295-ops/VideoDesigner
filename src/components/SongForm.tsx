import { motion } from 'framer-motion'

type Props = {
  title: string
  artist: string
  album: string
  onChange: (updates: {
    title?: string
    artist?: string
    album?: string
  }) => void
}

export function SongForm({ title, artist, album, onChange }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 space-y-4"
    >
      <h3 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
        <span className="text-violet-400">♪</span> Song details
      </h3>
      <div className="grid gap-4">
        <label className="block">
          <span className="text-sm text-slate-400 block mb-1">Song title *</span>
          <input
            type="text"
            value={title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="e.g. Laal Ishq"
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30 outline-none transition"
          />
        </label>
        <label className="block">
          <span className="text-sm text-slate-400 block mb-1">Singer / Artist *</span>
          <input
            type="text"
            value={artist}
            onChange={(e) => onChange({ artist: e.target.value })}
            placeholder="e.g. Arijit Singh"
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30 outline-none transition"
          />
        </label>
        <label className="block">
          <span className="text-sm text-slate-400 block mb-1">Album / Movie (optional)</span>
          <input
            type="text"
            value={album}
            onChange={(e) => onChange({ album: e.target.value })}
            placeholder="e.g. Goliyon Ki Raasleela Ram-Leela"
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30 outline-none transition"
          />
        </label>
      </div>
    </motion.div>
  )
}
