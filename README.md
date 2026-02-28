# Music Video Generator

Turn any image into a 60-second HD or 4K video with an animated music player, song details, and optional running lyrics.

## Features

- **Image upload** — Use your own image as the video background
- **Song details** — Title, artist, and optional album shown in the video
- **Animated music player** — Rotating vinyl disc animation in the center
- **Optional lyrics** — Paste lyrics; they appear in an animated frame, one line at a time with smooth transitions
- **HD or 4K** — Choose 1080p (faster) or 4K output
- **60 seconds, 30 fps** — Looping style, no backend required

## Run locally

```bash
npm install
npm run dev
```

Open the URL shown (e.g. `http://localhost:5173`). Use **Chrome** for best compatibility (WebM VP9 recording).

## Desktop app (Windows)

The app can run as a standalone window using Electron.

**Development (app window + Vite dev server):**
```bash
npm install
npm run electron:dev
```

**Build a single exe to run directly (no install):**
```bash
npm run electron:build:exe
```
The executable is created in the `release/` folder (e.g. `Music Video Generator 1.0.0.exe`). Double-click to run.

**Build installer + portable exe:**
```bash
npm run electron:build
```
Creates both an NSIS installer and the portable exe in `release/`.

## How it works

1. Upload an image and enter song title and artist.
2. Optionally enable “Show lyrics in video” and paste lyrics (one line per row).
3. Select output resolution (1080p or 4K) and click **Generate 60s Video**.
4. The app records a canvas animation in the browser for 60 seconds and then offers a **Download video** link.

Output is in **WebM** format. You can play it in Chrome or VLC, or convert to MP4 with an online tool if needed.

## Tech stack

- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, Framer Motion
- **Video:** Canvas 2D API + `captureStream()` + MediaRecorder (no server required)
