import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ImageUpload } from './components/ImageUpload'
import { AudioUpload } from './components/AudioUpload'
import { VideoUpload } from './components/VideoUpload'
import { SongForm } from './components/SongForm'
import { LyricsInput } from './components/LyricsInput'
import { VideoGenerator } from './components/VideoGenerator'
import { VideoPreview } from './components/VideoPreview'
import type { VideoStyleId } from './lib/videoStyles'
import { VIDEO_STYLES } from './lib/videoStyles'
import type { VisualizerId } from './lib/videoVisualizers'
import { VIDEO_VISUALIZERS } from './lib/videoVisualizers'
import type { BackgroundEffectId } from './lib/videoBackgroundEffects'
import { BACKGROUND_EFFECTS } from './lib/videoBackgroundEffects'
import type { ParticleEffectId } from './lib/videoParticleEffects'
import { PARTICLE_EFFECTS } from './lib/videoParticleEffects'
import type { CardStyleId } from './lib/cardStyles'
import { CARD_STYLES } from './lib/cardStyles'
import type { VideoAnimationId } from './lib/canvasRenderer'
import { loadSparkleImages } from './lib/effectImageLoader'

export type MainMedia =
  | { type: 'image'; file: File; preview: string }
  | { type: 'video'; file: File; preview: string }
  | { type: 'slideshow'; files: Array<{ file: File; preview: string }> }

export type SlideshowTransitionId =
  | 'fade'
  | 'zoom'
  | 'slideLeft'
  | 'slideRight'
  | 'slideUp'
  | 'slideDown'
  | 'zoomPan'
  | 'blur'
  | 'scaleDown'
  | 'wipe'
  | 'crossZoom'
  | 'random'

export type FormData = {
  /** Main visual: image, video, or slideshow (multiple images) */
  mainMedia: MainMedia | null
  /** Seconds per image in slideshow mode (only when mainMedia.type === 'slideshow') */
  slideshowSecondsPerSlide: number
  /** Transition effect between slides */
  slideshowTransition: SlideshowTransitionId
  /** When true, show slideshow images in random order (shuffled once per generation) */
  slideshowRandomOrder: boolean
  audioFile: File | null
  title: string
  artist: string
  album: string
  lyrics: string
  includeLyrics: boolean
  /** LRC, SRT, or ASS file – used first if provided */
  lyricFile: File | null
  lyricFileFormat: 'lrc' | 'srt' | 'ass' | null
  /** When lyrics are enabled: show them in the card (right half) or on screen (overlay) */
  lyricPosition: 'card' | 'screen'
  /** When true, use custom lyric style from lyricStyleOverrides. When false, use styles from .ass file. */
  useLyricStyleOverrides: boolean
  /** Custom lyric style (font, colors, outline). Only applied when useLyricStyleOverrides is true. */
  lyricStyleOverrides?: import('./lib/lyricSync').LyricStyleOverrides
  /** Where to show the audio visualizer: in the card or on the video/screen */
  visualizerPlacement: 'card' | 'screen'
  resolution: '720p' | '1080p' | '4k'
  /** Video orientation / aspect ratio (16:9 landscape, 9:16 shorts, etc.) */
  videoOrientation: VideoOrientationId
  /** Prefer GPU / lower memory (canvas hints) */
  preferGpu: boolean
  durationSeconds: number
  style: VideoStyleId
  visualizer: VisualizerId
  backgroundEffect: BackgroundEffectId
  /** Separate 3D particle overlay (spheres, confetti, hearts, etc.) */
  particleEffect: ParticleEffectId
  /** 0.5 | 0.75 | 1 – image opacity when a background effect is active (home selector) */
  imageOpacityWithEffect: number
  /** Optional background video (loops behind image) */
  videoFile: File | null
  /** 0.3–1 – front image opacity when background video is used */
  frontImageOpacityWhenVideo: number
  /** Output frame rate */
  fps: 30 | 60 | 80 | 120
  /** Audio visualizer size (on-video strip or in-card box) */
  visualizerSize: 'small' | 'medium' | 'large' | 'full'
  /** Audio visualizer position when drawn on video (e.g. when lyrics on) */
  visualizerPosition: 'top' | 'aboveCard' | 'center'
  /** Trim audio: start time in seconds (0 = from start) */
  audioTrimStart: number
  /** Trim audio: end time in seconds (0 = to end) */
  audioTrimEnd: number
  /** Instrumental mode: different animation (cover-focused, Ken Burns, full-width visualizer) */
  instrumental: boolean
  /** Card/box style: slide, fadeUp, scale, pill, glass */
  cardStyle: CardStyleId
  /** When enabled, the info card disappears after a few seconds using the same animation style in reverse */
  cardAutoHide: boolean
  /** Seconds after which the card should start disappearing (only when cardAutoHide is true) */
  cardAutoHideSeconds: number
  /** When main media is video: animation applied to the video (zoom, pan, etc.) */
  videoAnimation: VideoAnimationId
  /** When main visual is image/slideshow: detect face with AI and apply gentle nod animation */
  faceNodAnimation: boolean
  /** Convert main image/video to anime style using AI */
  convertToAnime: boolean
  /** Backend: local (AnimeGAN, free) or replicate (cloud, API key) */
  animeBackend: 'local' | 'replicate'
  /** Replicate API token (only when animeBackend === 'replicate') */
  replicateApiKey: string
  /** When main media is video: loop the video so the final length follows the audio (when available) instead of being cut to the video duration */
  loopMainVideoToAudio: boolean
  /** Output method: offline render (deterministic) vs real-time recording (MediaRecorder) */
  exportMethod: 'render' | 'record'
  /** When using Render: encoder backend – FFmpeg (WASM) or WebCodecs (GPU when available) */
  renderEncoder: 'ffmpeg' | 'webcodecs'
  /** Output container format – WebM (VP8/VP9) or MP4 (H.264). Record method always outputs WebM. */
  outputFormat: 'webm' | 'mp4'
  /** When enabled, convert MP4 input videos to WebM before use (may fix decode/seek issues; can be slow) */
  convertMp4InputToWebm: boolean
  /** Local Whisper API URL (e.g. http://127.0.0.1:8002 for faster-whisper-server). When set, used for lyric extraction instead of Replicate or in-browser model. */
  localWhisperUrl: string
}

export type VideoOrientationId = '16:9' | '9:16' | '1:1' | '4:5'

const initialForm: FormData = {
  mainMedia: null,
  slideshowSecondsPerSlide: 5,
  slideshowTransition: 'zoom',
  slideshowRandomOrder: false,
  audioFile: null,
  title: '',
  artist: '',
  album: '',
  lyrics: '',
  includeLyrics: false,
  lyricFile: null,
  lyricFileFormat: null,
  lyricPosition: 'card',
  useLyricStyleOverrides: false,
  visualizerPlacement: 'screen',
  resolution: '1080p',
  videoOrientation: '16:9',
  preferGpu: true,
  durationSeconds: 60,
  style: 'fresh',
  visualizer: 'bars',
  backgroundEffect: 'none',
  particleEffect: 'none',
  imageOpacityWithEffect: 0.75,
  videoFile: null,
  frontImageOpacityWhenVideo: 0.7,
  fps: 30,
  visualizerSize: 'medium',
  visualizerPosition: 'aboveCard',
  audioTrimStart: 0,
  audioTrimEnd: 0,
  instrumental: false,
  cardStyle: 'slide',
  cardAutoHide: false,
  cardAutoHideSeconds: 8,
  videoAnimation: 'kenBurns',
  faceNodAnimation: false,
  convertToAnime: false,
  animeBackend: 'local',
  replicateApiKey: '',
  loopMainVideoToAudio: false,
  exportMethod: 'render',
  renderEncoder: 'ffmpeg',
  outputFormat: 'mp4',
  convertMp4InputToWebm: false,
  localWhisperUrl: 'http://127.0.0.1:8002',
}

export default function App() {
  const [form, setForm] = useState<FormData>(initialForm)
  const [step, setStep] = useState<'form' | 'generating' | 'preview'>('form')
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null)
  const formAtGenerateRef = useRef<FormData>(initialForm)

  useEffect(() => {
    loadSparkleImages()
  }, [])

  const canGenerate = form.mainMedia && form.title.trim() && form.artist.trim()

  const handleGenerate = () => {
    if (!canGenerate) return
    formAtGenerateRef.current = form
    setStep('generating')
  }

  const handleVideoReady = (blob: Blob) => {
    setVideoBlob(blob)
    setStep('preview')
  }

  const handleReset = () => {
    setStep('form')
    setVideoBlob(null)
  }

  return (
    <div className="min-h-screen bg-[#0a0a12] bg-mesh relative overflow-x-hidden">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-pink-500/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '-3s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-violet-600/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-10 sm:py-16">
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <motion.h1
            className="text-4xl sm:text-5xl font-bold font-outfit bg-gradient-to-r from-violet-400 via-fuchsia-400 to-pink-400 bg-clip-text text-transparent"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
          >
            Music Video Generator
          </motion.h1>
          <motion.p
            className="mt-3 text-slate-400 text-lg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            Turn your image into an HD music player video with song details and lyrics
          </motion.p>
        </motion.header>

        <AnimatePresence mode="wait">
          {step === 'form' && (
            <motion.div
              key="form"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
              className="space-y-8"
            >
              <ImageUpload
                mainMedia={form.mainMedia}
                onSelect={(mainMedia) => {
                  setForm((f) => {
                    if (f.mainMedia) {
                      if (f.mainMedia.type === 'slideshow') {
                        f.mainMedia.files.forEach((x) => URL.revokeObjectURL(x.preview))
                      } else {
                        URL.revokeObjectURL(f.mainMedia.preview)
                      }
                    }
                    return { ...f, mainMedia }
                  })
                }}
              />
              {form.mainMedia?.type === 'slideshow' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6"
                >
                  <h3 className="text-lg font-semibold text-slate-200 mb-2">Slideshow settings</h3>
                  <p className="text-slate-500 text-sm mb-3">Each image is shown for the selected duration with a smooth transition.</p>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-slate-400 text-sm font-medium mb-2">Seconds per image</label>
                      <div className="flex flex-wrap gap-2">
                        {[3, 4, 5, 6, 7, 8, 10].map((sec) => (
                          <button
                            key={sec}
                            type="button"
                            onClick={() => setForm((f) => ({ ...f, slideshowSecondsPerSlide: sec }))}
                            className={`px-4 py-2 rounded-xl text-sm font-medium border transition ${
                              form.slideshowSecondsPerSlide === sec
                                ? 'border-violet-500 bg-violet-500/20 text-white'
                                : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20'
                            }`}
                          >
                            {sec}s
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.slideshowRandomOrder}
                          onChange={(e) => setForm((f) => ({ ...f, slideshowRandomOrder: e.target.checked }))}
                          className="rounded border-white/20 bg-white/5 text-violet-500 focus:ring-violet-500"
                        />
                        <span className="text-slate-300">Random order</span>
                      </label>
                      <p className="text-slate-500 text-sm mt-1">Show images in random order instead of selection order.</p>
                    </div>
                    <div>
                      <label className="block text-slate-400 text-sm font-medium mb-2">Transition effect</label>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { id: 'random' as const, label: 'Random', desc: 'Different effect each slide' },
                          { id: 'fade' as const, label: 'Fade' },
                          { id: 'zoom' as const, label: 'Zoom' },
                          { id: 'slideLeft' as const, label: 'Slide left' },
                          { id: 'slideRight' as const, label: 'Slide right' },
                          { id: 'slideUp' as const, label: 'Slide up' },
                          { id: 'slideDown' as const, label: 'Slide down' },
                          { id: 'zoomPan' as const, label: 'Ken Burns' },
                          { id: 'blur' as const, label: 'Blur' },
                          { id: 'scaleDown' as const, label: 'Scale down' },
                          { id: 'wipe' as const, label: 'Wipe' },
                          { id: 'crossZoom' as const, label: 'Cross zoom' },
                        ].map(({ id, label }) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setForm((f) => ({ ...f, slideshowTransition: id }))}
                            className={`px-4 py-2 rounded-xl text-sm font-medium border transition ${
                              form.slideshowTransition === id
                                ? 'border-violet-500 bg-violet-500/20 text-white'
                                : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6"
              >
                <h3 className="text-lg font-semibold text-slate-200 mb-2">Visual animation</h3>
                <p className="text-slate-500 text-sm mb-3">Motion effect for your image or video. Single image/video: animation loops every ~10s. Slideshow: each image gets the full animation over the selected &quot;seconds per image&quot;.</p>
                <label className="flex items-center gap-3 cursor-pointer mb-3">
                  <input
                    type="checkbox"
                    checked={form.faceNodAnimation}
                    onChange={(e) => setForm((f) => ({ ...f, faceNodAnimation: e.target.checked }))}
                    className="rounded border-white/20 bg-white/5 text-violet-500 focus:ring-violet-500"
                  />
                  <span className="text-slate-300">Face nod (AI)</span>
                </label>
                <p className="text-slate-500 text-xs mb-3">When using a single image or slideshow: detect face with AI and add a gentle nodding motion. Best for portraits and illustrated characters. Requires face detection models in <code className="bg-white/10 px-1 rounded">public/models/</code>.</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'random' as const, label: 'Random' },
                    { id: 'none' as const, label: 'None' },
                    { id: 'zoomIn' as const, label: 'Zoom in' },
                    { id: 'zoomOut' as const, label: 'Zoom out' },
                    { id: 'slowZoomIn' as const, label: 'Slow zoom in' },
                    { id: 'slowZoomOut' as const, label: 'Slow zoom out' },
                    { id: 'zoomInOut' as const, label: 'Zoom in & out' },
                    { id: 'kenBurns' as const, label: 'Ken Burns' },
                    { id: 'panLeft' as const, label: 'Pan left' },
                    { id: 'panRight' as const, label: 'Pan right' },
                  ].map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, videoAnimation: id }))}
                      className={`px-4 py-2 rounded-xl text-sm font-medium border transition ${
                        form.videoAnimation === id
                          ? 'border-violet-500 bg-violet-500/20 text-white'
                          : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {form.mainMedia?.type === 'video' && (
                  <div className="mt-4 space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.loopMainVideoToAudio}
                        onChange={(e) => setForm((f) => ({ ...f, loopMainVideoToAudio: e.target.checked }))}
                        className="rounded border-white/20 bg-white/5 text-violet-500 focus:ring-violet-500"
                      />
                      <span className="text-slate-300">Loop main video to match audio length</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.convertMp4InputToWebm}
                        onChange={(e) => setForm((f) => ({ ...f, convertMp4InputToWebm: e.target.checked }))}
                        className="rounded border-white/20 bg-white/5 text-violet-500 focus:ring-violet-500"
                      />
                      <span className="text-slate-300">Convert MP4 inputs to WebM</span>
                    </label>
                    <p className="text-slate-500 text-xs">
                      Loop: when you use a main video with audio, the video repeats to match audio length. Convert: enable only if you see decode/seek errors with MP4 (may be slow).
                    </p>
                  </div>
                )}
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.06 }}
                className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6"
              >
                <h3 className="text-lg font-semibold text-slate-200 mb-2">Anime conversion (AI)</h3>
                <p className="text-slate-500 text-sm mb-3">Convert your image or video to anime style. Use the free open-source model (runs in browser) or Replicate (cloud, API key).</p>
                <label className="flex items-center gap-3 cursor-pointer mb-3">
                  <input
                    type="checkbox"
                    checked={form.convertToAnime}
                    onChange={(e) => setForm((f) => ({ ...f, convertToAnime: e.target.checked }))}
                    className="rounded border-white/20 bg-white/5 text-violet-500 focus:ring-violet-500"
                  />
                  <span className="text-slate-300">Convert to anime</span>
                </label>
                {form.convertToAnime && (
                  <div className="mt-2 space-y-3">
                    <div>
                      <p className="text-slate-400 text-sm font-medium mb-2">Model</p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, animeBackend: 'local' }))}
                          className={`px-4 py-2 rounded-xl text-sm font-medium border transition ${
                            form.animeBackend === 'local'
                              ? 'border-violet-500 bg-violet-500/20 text-white'
                              : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20'
                          }`}
                        >
                          Local (AnimeGAN, free)
                        </button>
                        <button
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, animeBackend: 'replicate' }))}
                          className={`px-4 py-2 rounded-xl text-sm font-medium border transition ${
                            form.animeBackend === 'replicate'
                              ? 'border-violet-500 bg-violet-500/20 text-white'
                              : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20'
                          }`}
                        >
                          Replicate (cloud)
                        </button>
                      </div>
                      <p className="text-slate-500 text-xs mt-1">Local runs in your browser with no API key. Replicate uses AnimeGANv3 and requires a token.</p>
                    </div>
                    {form.animeBackend === 'replicate' && (
                      <div>
                        <label className="block text-slate-400 text-sm font-medium mb-1">Replicate API key (or set VITE_REPLICATE_API_TOKEN)</label>
                        <input
                          type="password"
                          value={form.replicateApiKey}
                          onChange={(e) => setForm((f) => ({ ...f, replicateApiKey: e.target.value }))}
                          placeholder="r8_..."
                          className="w-full px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:border-violet-500/50 outline-none"
                        />
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
              <AudioUpload
                audioFile={form.audioFile}
                onSelect={(file) => setForm((f) => ({ ...f, audioFile: file }))}
              />
              {form.audioFile && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6"
                >
                  <h3 className="text-lg font-semibold text-slate-200 mb-2">Trim audio (optional)</h3>
                  <p className="text-slate-500 text-sm mb-3">Use only part of the track. Start/end in seconds; leave End at 0 to use the full length.</p>
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2">
                      <span className="text-slate-400 text-sm">Start (s)</span>
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={form.audioTrimStart}
                        onChange={(e) => setForm((f) => ({ ...f, audioTrimStart: Math.max(0, Number(e.target.value) || 0) }))}
                        className="w-20 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white focus:border-violet-500/50 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </label>
                    <label className="flex items-center gap-2">
                      <span className="text-slate-400 text-sm">End (s)</span>
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={form.audioTrimEnd || ''}
                        onChange={(e) => setForm((f) => ({ ...f, audioTrimEnd: Math.max(0, Number(e.target.value) || 0) }))}
                        placeholder="0 = full"
                        className="w-24 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:border-violet-500/50 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </label>
                    <span className="text-slate-500 text-sm">0 = use full track</span>
                  </div>
                </motion.div>
              )}
              <VideoUpload
                videoFile={form.videoFile}
                onSelect={(file) => setForm((f) => ({ ...f, videoFile: file }))}
              />
              {form.videoFile && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6"
                >
                  {form.mainMedia?.type !== 'video' && (
                    <label className="flex items-center gap-3 cursor-pointer mb-4">
                      <input
                        type="checkbox"
                        checked={form.convertMp4InputToWebm}
                        onChange={(e) => setForm((f) => ({ ...f, convertMp4InputToWebm: e.target.checked }))}
                        className="rounded border-white/20 bg-white/5 text-violet-500 focus:ring-violet-500"
                      />
                      <span className="text-slate-300">Convert MP4 inputs to WebM</span>
                    </label>
                  )}
                  <h3 className="text-lg font-semibold text-slate-200 mb-2">Front image opacity</h3>
                  <p className="text-slate-500 text-sm mb-3">Lower = more background video visible; higher = more of your image on top. For smoother playback, use 60 fps in Output.</p>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min={0.3}
                      max={1}
                      step={0.01}
                      value={form.frontImageOpacityWhenVideo}
                      onChange={(e) => setForm((f) => ({ ...f, frontImageOpacityWhenVideo: Number(e.target.value) }))}
                      className="flex-1 h-2 rounded-full appearance-none bg-white/10 accent-violet-500"
                    />
                    <span className="text-slate-300 font-medium tabular-nums w-12">
                      {Math.round(form.frontImageOpacityWhenVideo * 100)}%
                    </span>
                  </div>
                </motion.div>
              )}
              <SongForm
                title={form.title}
                artist={form.artist}
                album={form.album}
                onChange={(updates) => setForm((f) => ({ ...f, ...updates }))}
              />
              <LyricsInput
                lyrics={form.lyrics}
                includeLyrics={form.includeLyrics}
                lyricFile={form.lyricFile}
                lyricFileFormat={form.lyricFileFormat}
                lyricPosition={form.lyricPosition}
                onChange={(lyrics, include) =>
                  setForm((f) => ({ ...f, lyrics, includeLyrics: include }))
                }
                onLyricPositionChange={(pos) =>
                  setForm((f) => ({ ...f, lyricPosition: pos }))
                }
                onLyricFileChange={(file, format) =>
                  setForm((f) => ({ ...f, lyricFile: file, lyricFileFormat: format }))
                }
                useLyricStyleOverrides={form.useLyricStyleOverrides}
                onUseLyricStyleOverridesChange={(v) =>
                  setForm((f) => ({ ...f, useLyricStyleOverrides: v }))
                }
                lyricStyleOverrides={form.lyricStyleOverrides}
                onLyricStyleOverridesChange={(o) =>
                  setForm((f) => ({ ...f, lyricStyleOverrides: o }))
                }
                audioFile={form.audioFile}
                videoFileForExtract={
                  !form.audioFile && form.mainMedia?.type === 'video'
                    ? form.mainMedia.file
                    : null
                }
                replicateApiKey={form.replicateApiKey}
                localWhisperUrl={form.localWhisperUrl}
                onLocalWhisperUrlChange={(url) => setForm((f) => ({ ...f, localWhisperUrl: url }))}
              />

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.17 }}
                className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6"
              >
                <h3 className="text-lg font-semibold text-slate-200 mb-2">Video type</h3>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.instrumental}
                    onChange={(e) => setForm((f) => ({ ...f, instrumental: e.target.checked }))}
                    className="rounded border-white/20 bg-white/5 text-violet-500 focus:ring-violet-500"
                  />
                  <span className="text-slate-300">Instrumental</span>
                </label>
                <p className="text-slate-500 text-sm mt-2">Cover-focused animation: slow zoom on art, full-width visualizer, minimal text. Best for instrumental tracks.</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18 }}
                className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6"
              >
                <h3 className="text-lg font-semibold text-slate-200 mb-3">Card style</h3>
                <p className="text-slate-500 text-sm mb-3">How the info card appears and animates on the video.</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {CARD_STYLES.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, cardStyle: c.id }))}
                      className={`flex flex-col gap-0.5 p-3 rounded-xl border-2 text-left transition ${
                        form.cardStyle === c.id
                          ? 'border-violet-500 bg-violet-500/15'
                          : 'border-white/10 bg-white/5 hover:border-white/20'
                      }`}
                    >
                      <span className="text-sm font-medium text-slate-200">{c.name}</span>
                      <span className="text-xs text-slate-500">{c.description}</span>
                    </button>
                  ))}
                </div>
                {form.cardStyle !== 'none' && (
                  <div className="mt-4 space-y-2">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.cardAutoHide}
                        onChange={(e) => setForm((f) => ({ ...f, cardAutoHide: e.target.checked }))}
                        className="rounded border-white/20 bg-white/5 text-violet-500 focus:ring-violet-500"
                      />
                      <span className="text-slate-300 text-sm">
                        Hide card after a few seconds
                      </span>
                    </label>
                    {form.cardAutoHide && (
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400 text-sm">Show card for</span>
                        <input
                          type="number"
                          min={2}
                          max={120}
                          value={form.cardAutoHideSeconds}
                          onChange={(e) => {
                            const v = Number(e.target.value)
                            const sec = !Number.isNaN(v) ? Math.max(2, Math.min(120, v)) : 8
                            setForm((f) => ({ ...f, cardAutoHideSeconds: sec }))
                          }}
                          className="w-20 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white focus:border-violet-500/50 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <span className="text-slate-400 text-sm">seconds, then fade out</span>
                      </div>
                    )}
                    <p className="text-slate-500 text-xs">
                      The card will appear with the selected style, stay visible for the chosen time, then disappear using the same animation in reverse.
                    </p>
                  </div>
                )}
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.19 }}
                className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6"
              >
                <h3 className="text-lg font-semibold text-slate-200 mb-3">Video style</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {VIDEO_STYLES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, style: s.id }))}
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition ${
                        form.style === s.id
                          ? 'border-violet-500 bg-violet-500/15'
                          : 'border-white/10 bg-white/5 hover:border-white/20'
                      }`}
                    >
                      <span
                        className="w-8 h-8 rounded-lg shrink-0"
                        style={{
                          background:
                            s.id === 'fresh'
                              ? 'linear-gradient(135deg, #22c55e, #86efac)'
                              : s.id === 'royal'
                                ? 'linear-gradient(135deg, #8b5cf6, #c4b5fd)'
                                : s.id === 'ocean'
                                  ? 'linear-gradient(135deg, #3b82f6, #93c5fd)'
                                  : s.id === 'sunset'
                                    ? 'linear-gradient(135deg, #f97316, #fdba74)'
                                    : s.id === 'dark'
                                      ? 'linear-gradient(135deg, #475569, #94a3b8)'
                                      : s.id === 'rose'
                                        ? 'linear-gradient(135deg, #f43f5e, #fda4af)'
                                        : s.id === 'mint'
                                          ? 'linear-gradient(135deg, #14b8a6, #5eead4)'
                                          : s.id === 'amber'
                                            ? 'linear-gradient(135deg, #f59e0b, #fcd34d)'
                                            : s.id === 'coral'
                                              ? 'linear-gradient(135deg, #fb7185, #fda4af)'
                                              : 'linear-gradient(135deg, #6366f1, #818cf8)',
                        }}
                      />
                      <span className="text-sm font-medium text-slate-200 truncate">{s.name}</span>
                    </button>
                  ))}
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.19 }}
                className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6"
              >
                <h3 className="text-lg font-semibold text-slate-200 mb-2">Audio visualizer</h3>
                <p className="text-slate-500 text-sm mb-3">On top of card; replaces lyric box when lyrics are off. Linear (bars/waves) or Circular (rings, orbs).</p>
                <div className="space-y-6">
                  <div>
                    <p className="text-slate-400 text-sm font-medium mb-2">Linear</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 max-h-40 overflow-y-auto">
                      {VIDEO_VISUALIZERS.filter((v) => v.group === 'linear').map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, visualizer: v.id }))}
                          className={`px-3 py-2 rounded-lg text-sm font-medium border transition ${
                            form.visualizer === v.id
                              ? 'border-violet-500 bg-violet-500/20 text-white'
                              : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20'
                          }`}
                        >
                          {v.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm font-medium mb-2">Circular</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 max-h-40 overflow-y-auto">
                      {VIDEO_VISUALIZERS.filter((v) => v.group === 'circular').map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, visualizer: v.id }))}
                          className={`px-3 py-2 rounded-lg text-sm font-medium border transition ${
                            form.visualizer === v.id
                              ? 'border-violet-500 bg-violet-500/20 text-white'
                              : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20'
                          }`}
                        >
                          {v.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-white/10 space-y-4">
                  <div>
                    <p className="text-slate-400 text-sm mb-2">Visualizer size</p>
                    <div className="flex flex-wrap gap-2">
                      {(['small', 'medium', 'large', 'full'] as const).map((size) => (
                        <button
                          key={size}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, visualizerSize: size }))}
                          className={`px-3 py-2 rounded-lg text-sm font-medium border transition capitalize ${
                            form.visualizerSize === size
                              ? 'border-violet-500 bg-violet-500/20 text-white'
                              : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20'
                          }`}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm mb-2">Visualizer placement</p>
                    <p className="text-slate-500 text-xs mb-2">Show visualizer in the card or on the video/screen.</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, visualizerPlacement: 'card' }))}
                        className={`px-3 py-2 rounded-lg text-sm font-medium border transition ${
                          form.visualizerPlacement === 'card'
                            ? 'border-violet-500 bg-violet-500/20 text-white'
                            : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20'
                        }`}
                      >
                        On card
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, visualizerPlacement: 'screen' }))}
                        className={`px-3 py-2 rounded-lg text-sm font-medium border transition ${
                          form.visualizerPlacement === 'screen'
                            ? 'border-violet-500 bg-violet-500/20 text-white'
                            : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20'
                        }`}
                      >
                        On screen
                      </button>
                    </div>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm mb-2">Visualizer position on video</p>
                    <p className="text-slate-500 text-xs mb-2">When visualizer is on screen: top, above card, or center.</p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { id: 'top' as const, label: 'Top' },
                        { id: 'aboveCard' as const, label: 'Above card' },
                        { id: 'center' as const, label: 'Center' },
                      ].map(({ id, label }) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, visualizerPosition: id }))}
                          className={`px-3 py-2 rounded-lg text-sm font-medium border transition ${
                            form.visualizerPosition === id
                              ? 'border-violet-500 bg-violet-500/20 text-white'
                              : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.194 }}
                className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6"
              >
                <h3 className="text-lg font-semibold text-slate-200 mb-2">Background effect</h3>
                <p className="text-slate-500 text-sm mb-3">Atmospheric overlay (fire, snow, fog, rain, etc.) with low opacity.</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 max-h-64 overflow-y-auto">
                  {BACKGROUND_EFFECTS.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, backgroundEffect: e.id }))}
                      className={`px-3 py-2 rounded-lg text-sm font-medium border transition ${
                        form.backgroundEffect === e.id
                          ? 'border-violet-500 bg-violet-500/20 text-white'
                          : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20'
                      }`}
                    >
                      {e.name}
                    </button>
                  ))}
                </div>
                <p className="text-slate-500 text-sm mt-3 mb-1">Image opacity when effect is on</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 1, label: 'High (100%)' },
                    { value: 0.75, label: 'Medium (75%)' },
                    { value: 0.5, label: 'Low (50%)' },
                  ].map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, imageOpacityWithEffect: value }))}
                      className={`px-3 py-2 rounded-lg text-sm font-medium border transition ${
                        form.imageOpacityWithEffect === value
                          ? 'border-violet-500 bg-violet-500/20 text-white'
                          : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.196 }}
                className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6"
              >
                <h3 className="text-lg font-semibold text-slate-200 mb-2">Particles</h3>
                <p className="text-slate-500 text-sm mb-3">3D-style floating particles with depth, perspective, and shadows. Rendered in a separate layer for a polished look.</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {PARTICLE_EFFECTS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, particleEffect: p.id }))}
                      className={`flex flex-col gap-0.5 p-3 rounded-xl border-2 text-left transition ${
                        form.particleEffect === p.id
                          ? 'border-violet-500 bg-violet-500/15'
                          : 'border-white/10 bg-white/5 hover:border-white/20'
                      }`}
                    >
                      <span className="text-sm font-medium text-slate-200">{p.name}</span>
                      {p.description && <span className="text-xs text-slate-500">{p.description}</span>}
                    </button>
                  ))}
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6"
              >
                <h3 className="text-lg font-semibold text-slate-200 mb-3">Output</h3>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2">
                    <span className="text-slate-400 text-sm">Method</span>
                    <select
                      value={form.exportMethod}
                      onChange={(e) => setForm((f) => ({ ...f, exportMethod: e.target.value as 'render' | 'record' }))}
                      className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white focus:border-violet-500/50 outline-none"
                    >
                      <option value="render">Render – smooth, works in background</option>
                      <option value="record">Record – requires focused tab</option>
                    </select>
                  </label>
                  {form.exportMethod === 'render' && (
                    <>
                      <label className="flex items-center gap-2">
                        <span className="text-slate-400 text-sm">Encoder</span>
                        <select
                          value={form.renderEncoder}
                          onChange={(e) => setForm((f) => ({ ...f, renderEncoder: e.target.value as 'ffmpeg' | 'webcodecs' }))}
                          className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white focus:border-violet-500/50 outline-none"
                        >
                          <option value="ffmpeg">FFmpeg (WASM)</option>
                          <option value="webcodecs">WebCodecs (GPU when available)</option>
                        </select>
                      </label>
                      <label className="flex items-center gap-2">
                        <span className="text-slate-400 text-sm">Format</span>
                        <select
                          value={form.outputFormat}
                          onChange={(e) => setForm((f) => ({ ...f, outputFormat: e.target.value as 'webm' | 'mp4' }))}
                          className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white focus:border-violet-500/50 outline-none"
                        >
                          <option value="webm">WebM (VP8/VP9)</option>
                          <option value="mp4">MP4 (H.264)</option>
                        </select>
                      </label>
                    </>
                  )}
                  {form.exportMethod === 'record' && (
                    <div className="w-full rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex flex-wrap items-center gap-3">
                      <span className="text-amber-200/90 text-sm">
                        Record requires keeping this tab focused. Output may stutter if you switch tabs. For smooth video and background operation, switch to Render.
                      </span>
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, exportMethod: 'render' }))}
                        className="shrink-0 px-4 py-1.5 rounded-lg bg-violet-500/30 border border-violet-400/40 text-violet-200 text-sm font-medium hover:bg-violet-500/40 transition"
                      >
                        Use Render instead
                      </button>
                    </div>
                  )}
                  <label className="flex items-center gap-2">
                    <span className="text-slate-400 text-sm">Orientation</span>
                    <select
                      value={form.videoOrientation}
                      onChange={(e) => setForm((f) => ({ ...f, videoOrientation: e.target.value as VideoOrientationId }))}
                      className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white focus:border-violet-500/50 outline-none"
                    >
                      <option value="16:9">16:9 Landscape (YouTube, standard)</option>
                      <option value="9:16">9:16 Portrait (Shorts, Reels, TikTok)</option>
                      <option value="1:1">1:1 Square</option>
                      <option value="4:5">4:5 Portrait (Instagram)</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="text-slate-400 text-sm">Resolution</span>
                    <select
                      value={form.resolution}
                      onChange={(e) => setForm((f) => ({ ...f, resolution: e.target.value as '720p' | '1080p' | '4k' }))}
                      className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white focus:border-violet-500/50 outline-none"
                    >
                      <option value="720p">720p (lower memory)</option>
                      <option value="1080p">HD 1080p</option>
                      <option value="4k">4K</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="text-slate-400 text-sm">Video length (seconds)</span>
                    <input
                      type="number"
                      min={10}
                      max={600}
                      value={form.durationSeconds === 0 ? '' : form.durationSeconds}
                      onChange={(e) => {
                        if (e.target.value === '') {
                          setForm((f) => ({ ...f, durationSeconds: 0 }))
                          return
                        }
                        const v = Number(e.target.value)
                        const sec = !Number.isNaN(v) ? Math.max(10, Math.min(600, v)) : 60
                        setForm((f) => ({ ...f, durationSeconds: sec }))
                      }}
                      placeholder="60"
                      className="w-24 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:border-violet-500/50 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="text-slate-400 text-sm">Frame rate</span>
                    <select
                      value={form.fps}
                      onChange={(e) => setForm((f) => ({ ...f, fps: Number(e.target.value) as 30 | 60 | 80 | 120 }))}
                      className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white focus:border-violet-500/50 outline-none"
                    >
                      <option value={30}>30 fps</option>
                      <option value={60}>60 fps</option>
                      <option value={80}>80 fps</option>
                      <option value={120}>120 fps</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.preferGpu}
                      onChange={(e) => setForm((f) => ({ ...f, preferGpu: e.target.checked }))}
                      className="rounded border-white/20 bg-white/5 text-violet-500 focus:ring-violet-500"
                    />
                    <span className="text-slate-300 text-sm">Use computer GPU for all resolutions</span>
                  </label>
                  {form.audioFile && (
                    <span className="text-violet-400/90 text-sm">Length from audio when provided</span>
                  )}
                </div>
                <p className="text-slate-500 text-sm mt-2">
                  <strong className="text-slate-400">Render</strong>: Frame-by-frame encode. Choose <strong>FFmpeg</strong> (WASM, broad support) or <strong>WebCodecs</strong> (may use GPU in Chrome/Edge). Both work in background. <strong className="text-slate-400">Record</strong>: Real-time MediaRecorder; requires focused tab.
                </p>
              </motion.div>

              <motion.div
                className="flex justify-center pt-4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <button
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                  className="px-8 py-4 rounded-2xl font-semibold text-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:scale-[1.02] active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  Generate Video
                </button>
              </motion.div>
            </motion.div>
          )}

          {step === 'generating' && (
            <VideoGenerator
              key="generating"
              form={formAtGenerateRef.current}
              onComplete={handleVideoReady}
              onCancel={() => setStep('form')}
            />
          )}

          {step === 'preview' && videoBlob && (
            <VideoPreview
              key="preview"
              blob={videoBlob}
              onReset={handleReset}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
