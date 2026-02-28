const { app, BrowserWindow, shell, ipcMain } = require('electron')
const path = require('path')
const ytdl = require('@distube/ytdl-core')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = []
    stream.on('data', (chunk) => chunks.push(chunk))
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', reject)
  })
}

ipcMain.handle('download-youtube-video', async (_event, url) => {
  if (!url || typeof url !== 'string') {
    throw new Error('Invalid YouTube URL')
  }
  const trimmed = url.trim()
  if (!/^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)/i.test(trimmed)) {
    throw new Error('Please enter a valid YouTube URL (e.g. https://www.youtube.com/watch?v=...)')
  }
  try {
    const stream = ytdl(trimmed, { quality: 'highest' })
    const buffer = await streamToBuffer(stream)
    const base64 = buffer.toString('base64')
    return { data: base64, mime: 'video/mp4' }
  } catch (err) {
    const msg = err.message || String(err)
    throw new Error(msg.includes('Sign in') || msg.includes('private') ? 'This video may be private or restricted. Try another video.' : `Download failed: ${msg}`)
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
