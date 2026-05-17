import { useCallback, useState } from 'react'
import { motion } from 'framer-motion'
import type { MainMedia } from '../App'
import { concatMp4VideoBlobs, ensureWebmVideo } from '../lib/offlineVideoRenderer'

declare global {
  interface Window {
    electronAPI?: {
      downloadYoutubeVideo: (url: string) => Promise<{ data: string; mime: string }>
      downloadYoutubeAudio: (url: string) => Promise<{ data: string; mime: string }>
    }
  }
}

type Props = {
  mainMedia: MainMedia | null
  onSelect: (mainMedia: MainMedia | null) => void
}

function stripUrl(u: string): string | null {
  const t = u.trim()
  if (!t) return null
  const withProto = /^https?:\/\//i.test(t) ? t : `https://${t.replace(/^\/+/, '')}`
  return withProto.trim()
}

/** Watch page, Shorts, youtu.be, playlist, or /embed/ — matches what the desktop downloader accepts. */
function isLikelyYoutubeMainVideoUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  const host = parsed.hostname.replace(/^www\./i, '').toLowerCase()
  const path = parsed.pathname
  const q = parsed.search
  if (host === 'youtu.be') {
    return /^\/[\w-]{11}\b/.test(path)
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com' || host === 'gaming.youtube.com') {
    if (path.startsWith('/shorts/')) return /\/shorts\/[\w-]{11}\b/.test(path)
    if (path.startsWith('/embed/')) return /\/embed\/[\w-]{11}\b/.test(path)
    if (path.startsWith('/playlist')) return /[?&]list=[\w-]+/.test(q)
    if (path === '/watch' || path.startsWith('/watch')) return /[?&]v=[\w-]{11}\b/.test(q)
  }
  return false
}

/** Trim brackets / quotes copied around links from chat, Markdown, Slack, etc. */
function trimUrlCopiedEdges(s: string): string {
  return s
    .trim()
    .replace(/^[('"[(]+\s*/, '')
    .replace(/[.,;:)\]}"'\]\s]*$/g, '')
    .trim()
}

/** Resolve to a canonical https URL for parsing (same hosts as isLikelyYoutubeMainVideoUrl). */
function normalizedYoutubeCandidate(cand: string): string | null {
  const t = trimUrlCopiedEdges(cand)
  if (!t) return null
  const withProto = /^https?:\/\//i.test(t) ? t : stripUrl(t)
  return withProto?.trim() || null
}

/**
 * Detect all YouTube URLs in pasted text: space- or comma-separated lines, prose, bullets.
 * Hits are merged and ordered by position in the string so order matches what you pasted.
 */
function parseYoutubeUrlList(raw: string): string[] {
  type Hit = { idx: number; cand: string }
  const hits: Hit[] = []

  const scanRe =
    /https?:\/\/(?:[\w-]+\.)*youtube\.com\/\S+|https?:\/\/(?:www\.)?youtu\.be\/\S+/gi
  for (const m of raw.matchAll(scanRe)) hits.push({ idx: m.index, cand: m[0] })

  const tokRe = /[^\s,;|\n\r\t]+/g
  let tm: RegExpExecArray | null
  tokRe.lastIndex = 0
  while ((tm = tokRe.exec(raw)) !== null) hits.push({ idx: tm.index, cand: tm[0] })

  const earliestPos = new Map<string, number>()
  for (const { idx, cand } of hits) {
    const u = normalizedYoutubeCandidate(cand)
    if (!u || !isLikelyYoutubeMainVideoUrl(u)) continue
    const prev = earliestPos.get(u)
    if (prev === undefined || idx < prev) earliestPos.set(u, idx)
  }
  return [...earliestPos.entries()].sort((a, b) => a[1] - b[1]).map(([u]) => u)
}

export function ImageUpload({ mainMedia, onSelect }: Props) {
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [youtubeLoading, setYoutubeLoading] = useState(false)
  const [youtubeError, setYoutubeError] = useState<string | null>(null)
  const [youtubeStatus, setYoutubeStatus] = useState<string | null>(null)
  const hasElectronAPI = typeof window !== 'undefined' && !!window.electronAPI
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const fileList = e.dataTransfer.files
      if (!fileList?.length) return
      const files = Array.from(fileList)
      const images = files.filter((f) => f.type.startsWith('image/'))
      const videos = files.filter((f) => f.type.startsWith('video/'))
      if (images.length > 1) {
        onSelect({
          type: 'slideshow',
          files: images.map((file) => ({ file, preview: URL.createObjectURL(file) })),
        })
      } else if (images.length === 1 && videos.length === 0) {
        onSelect({ type: 'image', file: images[0], preview: URL.createObjectURL(images[0]) })
      } else if (videos.length === 1 && images.length === 0) {
        onSelect({ type: 'video', file: videos[0], preview: URL.createObjectURL(videos[0]) })
      } else if (images.length === 1 && videos.length === 1) {
        onSelect({ type: 'image', file: images[0], preview: URL.createObjectURL(images[0]) })
      }
    },
    [onSelect]
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files
      if (!fileList?.length) return
      const files = Array.from(fileList)
      const images = files.filter((f) => f.type.startsWith('image/'))
      const videos = files.filter((f) => f.type.startsWith('video/'))
      if (images.length > 1) {
        onSelect({
          type: 'slideshow',
          files: images.map((file) => ({ file, preview: URL.createObjectURL(file) })),
        })
      } else if (images.length === 1 && videos.length === 0) {
        onSelect({ type: 'image', file: images[0], preview: URL.createObjectURL(images[0]) })
      } else if (videos.length === 1 && images.length === 0) {
        onSelect({ type: 'video', file: videos[0], preview: URL.createObjectURL(videos[0]) })
      } else if (images.length === 1 && videos.length === 1) {
        onSelect({ type: 'image', file: images[0], preview: URL.createObjectURL(images[0]) })
      }
      e.target.value = ''
    },
    [onSelect]
  )

  const clear = useCallback(() => {
    onSelect(null)
  }, [onSelect])

  const removeSlideshowImage = useCallback(
    (index: number) => {
      if (mainMedia?.type !== 'slideshow') return
      const next = mainMedia.files.filter((_, i) => i !== index)
      mainMedia.files.forEach((x) => URL.revokeObjectURL(x.preview))
      if (next.length === 0) {
        onSelect(null)
      } else if (next.length === 1) {
        onSelect({ type: 'image', file: next[0].file, preview: next[0].preview })
      } else {
        onSelect({ type: 'slideshow', files: next })
      }
    },
    [mainMedia, onSelect]
  )

  const handleYoutubeDownload = useCallback(async () => {
    const urls = parseYoutubeUrlList(youtubeUrl)
    if (urls.length === 0) {
      setYoutubeError('Please enter one or more YouTube URLs.')
      return
    }
    for (const url of urls) {
      if (!isLikelyYoutubeMainVideoUrl(url)) {
        setYoutubeError(`Invalid YouTube URL: ${url}`)
        return
      }
    }
    if (!window.electronAPI) {
      setYoutubeError('YouTube download is only available in the desktop app.')
      return
    }
    setYoutubeError(null)
    setYoutubeStatus(null)
    setYoutubeLoading(true)
    try {
      const blobs: Blob[] = []
      for (let i = 0; i < urls.length; i++) {
        setYoutubeStatus(urls.length > 1 ? `Downloading video ${i + 1} of ${urls.length}…` : 'Downloading…')
        const { data: base64, mime } = await window.electronAPI.downloadYoutubeVideo(urls[i])
        const binary = atob(base64)
        const bytes = new Uint8Array(binary.length)
        for (let k = 0; k < binary.length; k++) bytes[k] = binary.charCodeAt(k)
        blobs.push(new Blob([bytes], { type: mime || 'video/mp4' }))
      }
      if (urls.length > 1) setYoutubeStatus('Merging videos…')
      let merged = await concatMp4VideoBlobs(blobs, {
        onStatus: urls.length > 1 ? (msg) => setYoutubeStatus(msg ?? null) : undefined,
      })
      setYoutubeStatus('Preparing video for editor…')
      const baseName = blobs.length === 1 ? 'youtube-video' : `youtube-videos-${blobs.length}`
      merged = await ensureWebmVideo(
        new File([merged], `${baseName}.mp4`, { type: merged.type || 'video/mp4' }),
        { onStatus: (msg) => setYoutubeStatus(msg ?? null), convertIfMp4: false }
      )
      const ext = merged.type.includes('webm') ? 'webm' : 'mp4'
      const file = new File([merged], `${baseName}.${ext}`, { type: merged.type || 'video/mp4' })
      const preview = URL.createObjectURL(file)
      onSelect({ type: 'video', file, preview })
      setYoutubeUrl('')
    } catch (err) {
      setYoutubeError(err instanceof Error ? err.message : 'Download failed. Try another video.')
    } finally {
      setYoutubeStatus(null)
      setYoutubeLoading(false)
    }
  }, [youtubeUrl, onSelect])

  const youtubeLinkCount = youtubeUrl.trim() ? parseYoutubeUrlList(youtubeUrl).length : 0

  const isSlideshow = mainMedia?.type === 'slideshow'
  const isVideo = mainMedia?.type === 'video'
  const previewUrl = mainMedia && !isSlideshow ? mainMedia.preview : ''

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden"
    >
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className="relative border-2 border-dashed border-violet-500/30 rounded-xl m-4 p-8 transition-colors hover:border-violet-500/50 hover:bg-violet-500/5"
      >
        {!mainMedia && (
          <>
            <div className="relative">
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={handleFileInput}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="text-center text-slate-400 pointer-events-none">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-violet-500/20 text-violet-400 mb-4">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="font-medium text-slate-300">Drop your image(s) or video here or click to upload</p>
                <p className="text-sm mt-1">One image, multiple images (slideshow), or one video — PNG, JPG, WebP or MP4, WebM</p>
              </div>
            </div>
            {hasElectronAPI && (
              <div className="mt-4 pt-4 border-t border-white/10 mx-0 pb-0">
                <p className="text-slate-400 text-sm font-medium mb-2">Or use YouTube video(s)</p>
                <p className="text-slate-500 text-xs mb-3">
                  One URL, or several separated by spaces, commas, or new lines. They download in order and merge into one clip. Pasting &quot;youtu.be/…&quot; lines without https:// is fine.
                </p>
                <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                  <textarea
                    rows={Math.min(10, Math.max(3, youtubeUrl.split(/\r?\n/).length + 1))}
                    value={youtubeUrl}
                    onChange={(e) => { setYoutubeUrl(e.target.value); setYoutubeError(null) }}
                    placeholder={'https://www.youtube.com/watch?v=…\nhttps://youtu.be/…'}
                    className="flex-1 min-w-0 min-h-[52px] max-h-32 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:border-violet-500/50 outline-none text-sm resize-y"
                    disabled={youtubeLoading}
                  />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleYoutubeDownload() }}
                    disabled={youtubeLoading}
                    className="shrink-0 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-medium text-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {youtubeLoading ? youtubeStatus || 'Working…' : 'Download & use'}
                  </button>
                </div>
                {youtubeLinkCount > 0 && (
                  <p className="mt-1 text-xs text-slate-500">
                    {youtubeLinkCount === 1
                      ? '1 YouTube link detected'
                      : `${youtubeLinkCount} YouTube links detected (download in this order, then merged)`}
                  </p>
                )}
                {youtubeLoading && youtubeStatus && (
                  <p className="mt-2 text-sm text-slate-400">{youtubeStatus}</p>
                )}
                {youtubeError && (
                  <p className="mt-2 text-sm text-red-400">{youtubeError}</p>
                )}
              </div>
            )}
          </>
        )}
        {mainMedia ? isSlideshow ? (
          <div className="relative">
            <div className="flex items-center justify-between mb-3">
              <span className="text-violet-400 font-medium">Slideshow — {mainMedia.files.length} images</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); clear() }}
                className="p-2 rounded-lg bg-black/60 text-white hover:bg-red-500/80 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-48 overflow-y-auto">
              {mainMedia.files.map((item, index) => (
                <div key={item.preview} className="relative group aspect-square rounded-lg overflow-hidden bg-black/30">
                  <img
                    src={item.preview}
                    alt={`Slide ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeSlideshowImage(index) }}
                    className="absolute top-1 right-1 p-1 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 transition hover:bg-red-500/80"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  <span className="absolute bottom-1 left-1 text-xs font-medium bg-black/60 px-1.5 py-0.5 rounded">
                    {index + 1}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-2 text-center">Drag & drop or click to replace all. Remove individual images with the × on hover.</p>
          </div>
        ) : (
          <div className="relative">
            {isVideo ? (
              <video
                src={previewUrl}
                className="w-full max-h-64 object-contain rounded-lg mx-auto bg-black/40"
                muted
                loop
                playsInline
                preload="metadata"
              />
            ) : (
              <img
                src={previewUrl}
                alt="Preview"
                className="w-full max-h-64 object-contain rounded-lg mx-auto"
              />
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); clear() }}
              className="absolute top-2 right-2 p-2 rounded-lg bg-black/60 text-white hover:bg-red-500/80 transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            {mainMedia && (
              <p className="text-xs text-slate-500 mt-2 text-center truncate">
                {mainMedia.file.name}
                {isVideo && <span className="ml-1 text-violet-400">(video)</span>}
              </p>
            )}
          </div>
        ) : null}
      </div>
    </motion.div>
  )
}
