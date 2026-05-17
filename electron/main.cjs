const { app, BrowserWindow, shell, ipcMain } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const ytdl = require('@distube/ytdl-core')
const ytpl = require('@distube/ytpl')
const { constants: ytdlpConstants } = require('youtube-dl-exec')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = []
    stream.on('data', (chunk) => chunks.push(chunk))
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', reject)
  })
}

/** Normalize URL: extract video ID, strip playlist params (shortsCreater style). */
const YT_VIDEO_ID_RE = /(?:youtu\.be\/|youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/i
function normalizeYoutubeUrl(url) {
  const trimmed = (url || '').trim()
  if (!trimmed) return trimmed
  const m = trimmed.match(YT_VIDEO_ID_RE)
  if (m) return `https://www.youtube.com/watch?v=${m[1]}`
  return trimmed
}

/** Resolve to a single video URL. If playlist, returns first video URL. */
async function resolveToVideoUrl(input) {
  const trimmed = (input || '').trim()
  if (!trimmed) throw new Error('Invalid URL')
  const normalized = normalizeYoutubeUrl(trimmed)

  if (ytdl.validateURL(normalized)) {
    const vid = ytdl.getURLVideoID(normalized)
    return `https://www.youtube.com/watch?v=${vid}`
  }
  const playlistRegex = /list=([\w-]+)|youtube\.com\/playlist\?list=([\w-]+)/i
  if (playlistRegex.test(trimmed)) {
    try {
      const playlist = await ytpl(normalized, { limit: 1 })
      if (!playlist?.items?.length) throw new Error('Playlist is empty or could not be loaded.')
      const firstVideo = playlist.items[0]
      return firstVideo?.shortUrl || `https://www.youtube.com/watch?v=${firstVideo?.id}`
    } catch (e) {
      throw new Error('Could not load playlist. Try using the direct video URL instead.')
    }
  }
  throw new Error('Please enter a valid YouTube URL (video or playlist).')
}

/** Prefer H.264 MP4 so Chromium can draw frames to canvas (AV1/VP9-only often = audio-only in export). */
function ytdlH264MergedStream(videoUrl) {
  const h264Filter = (format) =>
    format.container === 'mp4' &&
    format.hasVideo &&
    format.hasAudio &&
    (!format.videoCodec || /avc|h264|mp4v/i.test(format.videoCodec))

  try {
    return ytdl(videoUrl, { quality: 'highest', filter: h264Filter })
  } catch {
    return ytdl(videoUrl, { quality: 'highest' })
  }
}

ipcMain.handle('download-youtube-video', async (_event, url) => {
  try {
    const videoUrl = await resolveToVideoUrl(url)
    const stream = ytdlH264MergedStream(videoUrl)
    const buffer = await streamToBuffer(stream)
    const base64 = buffer.toString('base64')
    return { data: base64, mime: 'video/mp4' }
  } catch (err) {
    const msg = err.message || String(err)
    throw new Error(msg.includes('Sign in') || msg.includes('private') ? 'This video may be private or restricted. Try another video.' : `Download failed: ${msg}`)
  }
})

/** Download audio via yt-dlp. Tries formats without ffmpeg, falls back to -x extraction (needs ffmpeg). */
async function downloadYoutubeAudioYtdlp(url) {
  const trimmed = (url || '').trim()
  if (!trimmed) throw new Error('Please enter a YouTube URL.')
  const videoUrl = normalizeYoutubeUrl(trimmed)
  const bin = ytdlpConstants.YOUTUBE_DL_PATH

  const runYtdlp = (formatStr) =>
    new Promise((resolve, reject) => {
      const args = [
        '-f', formatStr || 'bestaudio/best',
        '-o', '-', '--no-warnings', '--no-check-certificates', '--socket-timeout', '60',
      ]
      if (YT_VIDEO_ID_RE.test(videoUrl)) args.push('--no-playlist')
      else args.push('--playlist-items', '1')
      args.push(videoUrl)

      const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
      const outChunks = []
      const errChunks = []
      proc.stdout?.on('data', (ch) => outChunks.push(ch))
      proc.stderr?.on('data', (ch) => errChunks.push(ch))
      proc.on('error', () => reject(new Error('yt-dlp not available. Run: npm install')))
      proc.on('close', (code) => {
        const stderr = Buffer.concat(errChunks).toString('utf-8').trim()
        if (code === 0 && outChunks.length > 0) resolve(Buffer.concat(outChunks))
        else reject(new Error(stderr || `Download failed (code ${code})`))
      })
    })

  const runWithExtract = (audioFormat, mime) =>
    new Promise((resolve, reject) => {
      const args = [
        '-x', '-f', 'bestaudio/best', '--audio-format', audioFormat, '--audio-quality', '0',
        '-o', '-', '--no-warnings', '--no-check-certificates', '--socket-timeout', '60',
      ]
      if (YT_VIDEO_ID_RE.test(videoUrl)) args.push('--no-playlist')
      else args.push('--playlist-items', '1')
      args.push(videoUrl)
      const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
      const outChunks = []
      const errChunks = []
      proc.stdout?.on('data', (ch) => outChunks.push(ch))
      proc.stderr?.on('data', (ch) => errChunks.push(ch))
      proc.on('close', (code) => {
        if (code === 0 && outChunks.length > 0) resolve({ buffer: Buffer.concat(outChunks), mime })
        else reject(new Error(Buffer.concat(errChunks).toString('utf-8').trim() || `Failed (code ${code})`))
      })
    })

  const formats = [
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
      const msg = (e2?.message || String(e2)) || (e1?.message || String(e1))
      throw new Error(`${msg}\nTry another video or ensure FFmpeg is installed (required for -x audio extraction).`)
    }
  }
}

ipcMain.handle('download-youtube-audio', async (_event, url) => {
  try {
    const { buffer, mime } = await downloadYoutubeAudioYtdlp(url)
    const base64 = buffer.toString('base64')
    return { data: base64, mime }
  } catch (err) {
    const msg = err.message || String(err)
    throw new Error(msg.includes('Sign in') || msg.includes('private') ? 'This video may be private or restricted.' : `Download failed: ${msg}`)
  }
})

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Music Video Generator',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    show: false,
  })

  win.once('ready-to-show', () => {
    win.show()
    if (isDev) win.webContents.openDevTools()
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.on('did-fail-load', () => {
      setTimeout(() => win.loadURL('http://localhost:5173'), 500)
    })
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
