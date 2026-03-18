import { useState } from 'react'
import { motion } from 'framer-motion'
import { syncLyricsWithAI, extractLyricsFromAudioAuto, parseLyrics, type LyricStyleOverrides } from '../lib/lyricSync'

type Props = {
  lyrics: string
  includeLyrics: boolean
  lyricFile: File | null
  lyricFileFormat: 'lrc' | 'srt' | 'ass' | null
  lyricPosition: 'card' | 'screen'
  useLyricStyleOverrides?: boolean
  onUseLyricStyleOverridesChange?: (v: boolean) => void
  lyricStyleOverrides?: LyricStyleOverrides | null
  onLyricStyleOverridesChange?: (o: LyricStyleOverrides | undefined) => void
  onChange: (lyrics: string, includeLyrics: boolean) => void
  onLyricPositionChange: (position: 'card' | 'screen') => void
  onLyricFileChange: (file: File | null, format: 'lrc' | 'srt' | 'ass' | null) => void
  /** Separate audio file – used for Extract. */
  audioFile?: File | null
  /** Video file when main media is video and no audio file – Extract will use its audio. */
  videoFileForExtract?: File | null
  replicateApiKey?: string
  /** Local Whisper API URL (e.g. http://127.0.0.1:8002). Used for Extract when no Replicate key. */
  localWhisperUrl?: string
  onLocalWhisperUrlChange?: (url: string) => void
}

const EMPTY_OVERRIDES: LyricStyleOverrides = {}

export function LyricsInput({
  lyrics,
  includeLyrics,
  lyricFile,
  lyricFileFormat,
  lyricPosition,
  useLyricStyleOverrides = false,
  onUseLyricStyleOverridesChange,
  lyricStyleOverrides,
  onLyricStyleOverridesChange,
  onChange,
  onLyricPositionChange,
  onLyricFileChange,
  audioFile,
  videoFileForExtract,
  replicateApiKey,
  localWhisperUrl,
  onLocalWhisperUrlChange,
}: Props) {
  const [syncStatus, setSyncStatus] = useState<string | null>(null)
  const overrides = lyricStyleOverrides ?? EMPTY_OVERRIDES
  const [extractStatus, setExtractStatus] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const hasSynced = !!lyricFile || parseLyrics(lyrics).type === 'synced'
  const hasReplicate = !!(replicateApiKey?.trim() || (typeof import.meta !== 'undefined' && (import.meta as { env?: { VITE_REPLICATE_API_TOKEN?: string } }).env?.VITE_REPLICATE_API_TOKEN))
  const canExtract = !!(audioFile || videoFileForExtract)
  const canSyncWithAI = !!(audioFile || videoFileForExtract) && !!lyrics.trim() && hasReplicate
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
          className="overflow-hidden space-y-3"
        >
          <div>
            <p className="text-slate-400 text-sm font-medium mb-2">1. Lyric file (LRC, SRT, or ASS)</p>
            <p className="text-slate-500 text-xs mb-2">If provided, this file is used. Otherwise use text box or AI extract.</p>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <select
                value={lyricFileFormat || ''}
                onChange={(e) => {
                  const fmt = e.target.value as 'lrc' | 'srt' | 'ass' | ''
                  onLyricFileChange(lyricFile, fmt || null)
                }}
                className="px-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 text-slate-200 focus:border-violet-500/50 outline-none"
              >
                <option value="">Select format</option>
                <option value="lrc">LRC</option>
                <option value="srt">SRT</option>
                <option value="ass">ASS</option>
              </select>
              <label className="px-4 py-2 rounded-lg text-sm font-medium border border-white/20 bg-white/5 text-slate-300 hover:bg-white/10 cursor-pointer transition">
                {lyricFile ? lyricFile.name : 'Choose file'}
                <input
                  type="file"
                  accept=".lrc,.srt,.ass"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (!f) {
                      onLyricFileChange(null, null)
                      return
                    }
                    const ext = f.name.toLowerCase().split('.').pop()
                    const format = (ext === 'lrc' || ext === 'srt' || ext === 'ass' ? ext : lyricFileFormat || 'lrc') as 'lrc' | 'srt' | 'ass'
                    onLyricFileChange(f, format)
                  }}
                />
              </label>
              {lyricFile && (
                <button
                  type="button"
                  onClick={() => onLyricFileChange(null, null)}
                  className="text-red-400/80 text-xs hover:text-red-400"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
          <div>
            <p className="text-slate-400 text-sm font-medium mb-2">2. Or paste lyrics</p>
            <p className="text-slate-500 text-xs mb-2">With timestamps (LRC format) = synced. Plain text = scrolling.</p>
          </div>
          <div>
            <p className="text-slate-400 text-sm font-medium mb-2">Lyrics position</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onLyricPositionChange('card')}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition ${
                  lyricPosition === 'card'
                    ? 'border-violet-500 bg-violet-500/20 text-white'
                    : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20'
                }`}
              >
                On card
              </button>
              <button
                type="button"
                onClick={() => onLyricPositionChange('screen')}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition ${
                  lyricPosition === 'screen'
                    ? 'border-violet-500 bg-violet-500/20 text-white'
                    : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20'
                }`}
              >
                On screen
              </button>
            </div>
            <p className="text-slate-500 text-xs mt-1">
              Card: lyrics in the music player bar. Screen: lyrics overlay the full video area.
            </p>
          </div>
          {onLyricStyleOverridesChange && onUseLyricStyleOverridesChange && (
            <div>
              <label className="flex items-center gap-3 cursor-pointer mb-2">
                <input
                  type="checkbox"
                  checked={useLyricStyleOverrides}
                  onChange={(e) => onUseLyricStyleOverridesChange(e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 bg-white/5 text-violet-500 focus:ring-violet-500/50"
                />
                <span className="text-slate-400 text-sm font-medium">Use custom lyric style</span>
              </label>
              <p className="text-slate-500 text-xs mb-2">
                {useLyricStyleOverrides ? 'Using custom values below.' : 'Unchecked = use styles from .ass file.'}
              </p>
              {useLyricStyleOverrides && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 rounded-lg bg-white/5 border border-white/10"
                >
                  <label className="flex flex-col gap-1">
                    <span className="text-slate-500 text-xs">Font</span>
                    <select
                      value={overrides.fontName ?? ''}
                      onChange={(e) => onLyricStyleOverridesChange({ ...overrides, fontName: e.target.value || undefined })}
                      className="px-2 py-1.5 rounded text-sm bg-white/5 border border-white/10 text-slate-200"
                    >
                      <option value="">Default (from ASS)</option>
                      <option value="Century Gothic">Century Gothic</option>
                      <option value="Arial">Arial</option>
                      <option value="Arial Black">Arial Black</option>
                      <option value="Georgia">Georgia</option>
                      <option value="Impact">Impact</option>
                      <option value="Times New Roman">Times New Roman</option>
                      <option value="Trebuchet MS">Trebuchet MS</option>
                      <option value="Verdana">Verdana</option>
                      <option value="Comic Sans MS">Comic Sans MS</option>
                      <option value="Courier New">Courier New</option>
                      <option value="Lucida Sans Unicode">Lucida Sans Unicode</option>
                      <option value="Tahoma">Tahoma</option>
                      <option value="Outfit">Outfit</option>
                      <option value="Inter">Inter</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-slate-500 text-xs">Font size (1080p)</span>
                    <input
                      type="number"
                      min={8}
                      max={120}
                      value={overrides.fontSize ?? ''}
                      onChange={(e) => {
                        const v = e.target.value ? parseInt(e.target.value, 10) : undefined
                        onLyricStyleOverridesChange({ ...overrides, fontSize: v })
                      }}
                      placeholder="41"
                      className="px-2 py-1.5 rounded text-sm bg-white/5 border border-white/10 text-slate-200 placeholder-slate-600"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-slate-500 text-xs">Alignment (1–9)</span>
                    <select
                      value={overrides.alignment ?? ''}
                      onChange={(e) => {
                        const v = e.target.value ? parseInt(e.target.value, 10) : undefined
                        onLyricStyleOverridesChange({ ...overrides, alignment: v })
                      }}
                      className="px-2 py-1.5 rounded text-sm bg-white/5 border border-white/10 text-slate-200"
                    >
                      <option value="">Default</option>
                      <option value="7">7 Top-left</option>
                      <option value="8">8 Top-center</option>
                      <option value="9">9 Top-right</option>
                      <option value="4">4 Mid-left</option>
                      <option value="5">5 Center</option>
                      <option value="6">6 Mid-right</option>
                      <option value="1">1 Bottom-left</option>
                      <option value="2">2 Bottom-center</option>
                      <option value="3">3 Bottom-right</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-slate-500 text-xs">Primary color</span>
                    <input
                      type="color"
                      value={/^#[0-9A-Fa-f]{6}$/.test(overrides.primaryColor ?? '') ? overrides.primaryColor! : '#FF0000'}
                      onChange={(e) => onLyricStyleOverridesChange({ ...overrides, primaryColor: e.target.value })}
                      className="h-9 min-w-[80px] rounded border border-white/10 bg-white/5 cursor-pointer"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-slate-500 text-xs">Outline color</span>
                    <input
                      type="color"
                      value={/^#[0-9A-Fa-f]{6}$/.test(overrides.outlineColor ?? '') ? overrides.outlineColor! : '#EDD4D4'}
                      onChange={(e) => onLyricStyleOverridesChange({ ...overrides, outlineColor: e.target.value })}
                      className="h-9 min-w-[80px] rounded border border-white/10 bg-white/5 cursor-pointer"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-slate-500 text-xs">Shadow color</span>
                    <input
                      type="color"
                      value={/^#[0-9A-Fa-f]{6}$/.test(overrides.shadowColor ?? '') ? overrides.shadowColor! : '#EA6262'}
                      onChange={(e) => onLyricStyleOverridesChange({ ...overrides, shadowColor: e.target.value })}
                      className="h-9 min-w-[80px] rounded border border-white/10 bg-white/5 cursor-pointer"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-slate-500 text-xs">Outline width (px)</span>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={overrides.outlineWidth ?? ''}
                      onChange={(e) => {
                        const v = e.target.value ? parseInt(e.target.value, 10) : undefined
                        onLyricStyleOverridesChange({ ...overrides, outlineWidth: v })
                      }}
                      placeholder="2"
                      className="px-2 py-1.5 rounded text-sm bg-white/5 border border-white/10 text-slate-200 placeholder-slate-600"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-slate-500 text-xs">Shadow depth (px)</span>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={overrides.shadowDepth ?? ''}
                      onChange={(e) => {
                        const v = e.target.value ? parseInt(e.target.value, 10) : undefined
                        onLyricStyleOverridesChange({ ...overrides, shadowDepth: v })
                      }}
                      placeholder="2"
                      className="px-2 py-1.5 rounded text-sm bg-white/5 border border-white/10 text-slate-200 placeholder-slate-600"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-slate-500 text-xs">Margin V (px)</span>
                    <input
                      type="number"
                      min={0}
                      max={200}
                      value={overrides.marginV ?? ''}
                      onChange={(e) => {
                        const v = e.target.value ? parseInt(e.target.value, 10) : undefined
                        onLyricStyleOverridesChange({ ...overrides, marginV: v })
                      }}
                      placeholder="38"
                      className="px-2 py-1.5 rounded text-sm bg-white/5 border border-white/10 text-slate-200 placeholder-slate-600"
                    />
                  </label>
                  <label className="flex items-center gap-2 col-span-2">
                    <input
                      type="checkbox"
                      checked={overrides.italic ?? false}
                      onChange={(e) => onLyricStyleOverridesChange({ ...overrides, italic: e.target.checked })}
                      className="rounded border-white/20 bg-white/5 text-violet-500"
                    />
                    <span className="text-slate-400 text-sm">Italic</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={overrides.bold ?? false}
                      onChange={(e) => onLyricStyleOverridesChange({ ...overrides, bold: e.target.checked })}
                      className="rounded border-white/20 bg-white/5 text-violet-500"
                    />
                    <span className="text-slate-400 text-sm">Bold</span>
                  </label>
                </motion.div>
              )}
            </div>
          )}
          <div>
            <p className="text-slate-400 text-sm font-medium mb-2">3. Or extract / sync with AI</p>
            <p className="text-slate-500 text-xs mb-2">
              No file or text? <strong>Extract</strong> gets lyrics from your audio (Replicate, local Whisper server, or in-browser). Plain text? <strong>Sync</strong> aligns it (Replicate). During render, lyrics auto-extract from audio or video.
            </p>
            {(canExtract || onLocalWhisperUrlChange) && (
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-slate-400 text-xs">Local Whisper:</span>
                <input
                  type="url"
                  value={localWhisperUrl ?? ''}
                  onChange={(e) => onLocalWhisperUrlChange?.(e.target.value)}
                  placeholder="http://127.0.0.1:8002"
                  className="flex-1 min-w-[200px] px-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 text-slate-200 placeholder-slate-500 focus:border-violet-500/50 outline-none"
                />
              </div>
            )}
            {canExtract && (
              <div className="flex flex-wrap gap-2 mb-2">
                <button
                  type="button"
                  disabled={!!extractStatus || !!syncStatus}
                  onClick={async () => {
                    const source = audioFile ?? videoFileForExtract
                    if (!source) return
                    setSyncError(null)
                    setExtractStatus('Starting…')
                    try {
                      let audioToUse: File = source
                      if (videoFileForExtract && !audioFile) {
                        setExtractStatus('Extracting audio from video…')
                        const { extractAudioFromVideo } = await import('../lib/offlineVideoRenderer')
                        audioToUse = await extractAudioFromVideo(source, {
                          onStatus: (msg) => setExtractStatus(msg ?? 'Extracting…'),
                        })
                      }
                      const lrc = await extractLyricsFromAudioAuto(audioToUse, {
                        replicateApiKey,
                        localWhisperUrl: localWhisperUrl?.trim() || undefined,
                        onStatus: (msg) => setExtractStatus(msg),
                      })
                      onChange(lrc, true)
                      setExtractStatus('Done! Lyrics extracted and synced.')
                      setTimeout(() => setExtractStatus(null), 3000)
                    } catch (e) {
                      setSyncError(e instanceof Error ? e.message : 'Extraction failed')
                      setExtractStatus(null)
                    }
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-emerald-500/50 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {extractStatus || 'Extract lyrics from audio'}
                </button>
                {canSyncWithAI && (
                  <button
                    type="button"
                    disabled={!!syncStatus || !!extractStatus}
                    onClick={async () => {
                      const source = audioFile ?? videoFileForExtract
                      if (!source) return
                      setSyncError(null)
                      setSyncStatus('Starting…')
                      try {
                        let audioToUse: File = source
                        if (videoFileForExtract && !audioFile) {
                          setSyncStatus('Extracting audio from video…')
                          const { extractAudioFromVideo } = await import('../lib/offlineVideoRenderer')
                          audioToUse = await extractAudioFromVideo(source, {
                            onStatus: (msg) => setSyncStatus(msg ?? 'Extracting…'),
                          })
                        }
                        const lrc = await syncLyricsWithAI(
                          audioToUse,
                          lyrics,
                          replicateApiKey || '',
                          (msg) => setSyncStatus(msg)
                        )
                        onChange(lrc, true)
                        setSyncStatus('Done! Lyrics synced.')
                        setTimeout(() => setSyncStatus(null), 3000)
                      } catch (e) {
                        setSyncError(e instanceof Error ? e.message : 'Sync failed')
                        setSyncStatus(null)
                      }
                    }}
                    className="px-4 py-2 rounded-lg text-sm font-medium border border-violet-500/50 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20 disabled:opacity-60 disabled:cursor-not-allowed transition"
                  >
                    {syncStatus || 'Sync plain lyrics to audio'}
                  </button>
                )}
              </div>
            )}
            {syncError && (
              <p className="text-red-400 text-xs mt-2">{syncError}</p>
            )}
            {hasSynced && (
              <p className="text-emerald-400/90 text-xs mt-2">✓ Synced lyrics – will show one line at a time with the song.</p>
            )}
          </div>
          <textarea
            value={lyrics}
            onChange={(e) => onChange(e.target.value, true)}
            placeholder="Paste lyrics. LRC format ([00:12.50] Line text) = synced. Plain = scrolling."
            rows={6}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30 outline-none transition resize-y min-h-[120px]"
          />
        </motion.div>
      )}
    </motion.div>
  )
}
