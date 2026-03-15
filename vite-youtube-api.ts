import type { Plugin } from 'vite'
import { spawn } from 'node:child_process'
import { constants as ytdlpConstants } from 'youtube-dl-exec'

/** Normalize YouTube URL: extract video ID, strip playlist params, return clean single-video URL (shortsCreater style). */
const YT_VIDEO_ID_RE = /(?:youtu\.be\/|youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/i
const YT_URL_RE = /youtube\.com|youtu\.be/i
function normalizeYoutubeUrl(url: string): string {
  const trimmed = (url || '').trim()
  if (!trimmed) return trimmed
  const m = trimmed.match(YT_VIDEO_ID_RE)
  if (m) return `https://www.youtube.com/watch?v=${m[1]}`
  return trimmed
}

/** Download audio via yt-dlp. Uses direct format selection (no ffmpeg needed). Falls back through formats. */
async function downloadYoutubeAudio(url: string): Promise<{ buffer: Buffer; mime: string }> {
  const trimmed = (url || '').trim()
  if (!trimmed) throw new Error('Please enter a YouTube URL.')
  if (!YT_URL_RE.test(trimmed)) throw new Error('Please enter a valid YouTube URL.')
  const videoUrl = normalizeYoutubeUrl(trimmed)
  const bin = ytdlpConstants.YOUTUBE_DL_PATH

  const runYtdlp = (formatStr: string) =>
    new Promise<Buffer>((resolve, reject) => {
      const args = [
        '-f', formatStr || 'bestaudio/best',
        '-o', '-', '--no-warnings', '--no-check-certificates',
        '--socket-timeout', '60',
      ]
      if (YT_VIDEO_ID_RE.test(videoUrl)) args.push('--no-playlist')
      else args.push('--playlist-items', '1')
      args.push(videoUrl)

      const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
      const outChunks: Buffer[] = []
      const errChunks: Buffer[] = []
      proc.stdout?.on('data', (ch: Buffer) => outChunks.push(ch))
      proc.stderr?.on('data', (ch: Buffer) => errChunks.push(ch))
      proc.on('error', () => reject(new Error('yt-dlp not available. Run: npm install')))
      proc.on('close', (code) => {
        const stderr = Buffer.concat(errChunks).toString('utf-8').trim()
        if (code === 0 && outChunks.length > 0) resolve(Buffer.concat(outChunks))
        else reject(new Error(stderr || `Download failed (code ${code})`))
      })
    })

  const runWithExtract = (audioFormat: string, mime: string) =>
    new Promise<{ buffer: Buffer; mime: string }>((resolve, reject) => {
      const args = [
        '-x', '-f', 'bestaudio/best', '--audio-format', audioFormat, '--audio-quality', '0',
        '-o', '-', '--no-warnings', '--no-check-certificates', '--socket-timeout', '60',
      ]
      if (YT_VIDEO_ID_RE.test(videoUrl)) args.push('--no-playlist')
      else args.push('--playlist-items', '1')
      args.push(videoUrl)
      const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
      const outChunks: Buffer[] = []
      const errChunks: Buffer[] = []
      proc.stdout?.on('data', (ch: Buffer) => outChunks.push(ch))
      proc.stderr?.on('data', (ch: Buffer) => errChunks.push(ch))
      proc.on('close', (code) => {
        if (code === 0 && outChunks.length > 0) resolve({ buffer: Buffer.concat(outChunks), mime })
        else reject(new Error(Buffer.concat(errChunks).toString('utf-8').trim() || `Failed (code ${code})`))
      })
    })

  const formats: Array<{ fmt: string; mime: string }> = [
    { fmt: 'bestaudio[ext=webm]/bestaudio[ext=webm]/bestaudio', mime: 'audio/webm' },
    { fmt: 'bestaudio[ext=m4a]/bestaudio[ext=mp4]/bestaudio', mime: 'audio/mp4' },
    { fmt: 'bestaudio/best', mime: 'audio/webm' },
  ]
  for (const { fmt, mime } of formats) {
    try {
      const buffer = await runYtdlp(fmt)
      return { buffer, mime }
    } catch {
      continue
    }
  }
  try {
    return await runWithExtract('webm', 'audio/webm')
  } catch (e1) {
    try {
      return await runWithExtract('m4a', 'audio/mp4')
    } catch (e2) {
      const msg = (e2 instanceof Error ? e2.message : String(e2)) || (e1 instanceof Error ? e1.message : String(e1))
      throw new Error(`${msg}\nTry another video or ensure FFmpeg is installed (required for -x audio extraction).`)
    }
  }
}

async function handleYoutubeDownload(bodyJson: { url?: string }): Promise<{ data: string; mime: string }> {
  const { url } = bodyJson
  if (!url || typeof url !== 'string') throw new Error('Please enter a YouTube URL.')
  const { buffer, mime } = await downloadYoutubeAudio(url)
  return { data: buffer.toString('base64'), mime }
}

function createMiddleware() {
  return async (
    req: import('http').IncomingMessage & { url?: string },
    res: import('http').ServerResponse,
    next: () => void
  ) => {
    if (req.method !== 'POST' || req.url !== '/api/download-youtube-audio') {
      next()
      return
    }
    res.setHeader('Content-Type', 'application/json')
    try {
      const body = await new Promise<string>((resolve, reject) => {
        const chunks: Buffer[] = []
        req.on('data', (chunk: Buffer) => chunks.push(chunk))
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
        req.on('error', reject)
      })
      const json = JSON.parse(body) as { url?: string }
      const result = await handleYoutubeDownload(json)
      res.statusCode = 200
      res.end(JSON.stringify(result))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      const friendly =
        msg.includes('Sign in') || msg.includes('private')
          ? 'This video may be private or restricted. Try another video.'
          : msg
      res.statusCode = 400
      res.end(JSON.stringify({ error: friendly }))
    }
  }
}

export function youtubeApiPlugin(): Plugin {
  return {
    name: 'youtube-api',
    configureServer(server) {
      server.middlewares.use(createMiddleware())
    },
    configurePreviewServer(server) {
      server.middlewares.use(createMiddleware())
    },
  }
}
