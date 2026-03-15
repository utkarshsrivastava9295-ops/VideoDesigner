const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  downloadYoutubeVideo: (url) => ipcRenderer.invoke('download-youtube-video', url),
  downloadYoutubeAudio: (url) => ipcRenderer.invoke('download-youtube-audio', url),
})
