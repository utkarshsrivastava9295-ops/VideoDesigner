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

Open the URL shown (e.g. `http://localhost:5173`). Use **Chrome** or **Edge** for best compatibility (WebCodecs, FFmpeg WASM, WebM/MP4 output).

### AI features (face detection, anime conversion)

For the **Face nod (AI)** and **local anime conversion** features, download the models first:

```bash
npm run download-models
```

This downloads face detection and AnimeGAN models into `public/models/`. Without them, those features are disabled.

## Docker

### Quick start (no AI models)

```bash
docker build -t video-designer .
docker run -p 8080:80 video-designer
```

Open `http://localhost:8080`.

### With AI models

To include face detection and AnimeGAN models in the image:

```bash
docker build -f Dockerfile.models -t video-designer:with-models .
docker run -p 8080:80 video-designer:with-models
```

This image is larger but enables **Face nod (AI)** and **local anime conversion** without external CDN calls.

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

Output can be **WebM** (VP8/VP9) or **MP4** (H.264). Choose the format in the Output section. Use **Chrome** or **Edge** for best encoder support; FFmpeg (WASM) works in all supported browsers.

## Tech stack

- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, Framer Motion
- **Video:** Canvas 2D API + `captureStream()` + MediaRecorder (no server required)
