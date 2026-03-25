/**
 * Music player overlay – card at bottom (no progress bar).
 * Card: album art (left) | song details (half right) | lyrics scrolling bottom→top (half right).
 * Supports 5 selectable styles (themes).
 */

import type { VideoStyleId } from './videoStyles'
import { getVideoStyleTheme } from './videoStyles'
import type { VisualizerId } from './videoVisualizers'
import { drawVisualizer } from './drawVisualizers'
import type { BackgroundEffectId } from './videoBackgroundEffects'
import { drawBackgroundEffect } from './drawBackgroundEffects'
import type { ParticleEffectId } from './videoParticleEffects'
import { drawParticleEffect } from './drawParticleEffects'
import type { CardStyleId } from './cardStyles'
import type { AssStyle, LyricStyleOverrides, ParsedLyrics } from './lyricSync'
import { getCurrentLineIndex, mergeLyricStyleOverrides } from './lyricSync'
import { getCardAnimation, CARD_ENTRANCE_MS } from './cardStyles'

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

/** Concrete transition ids (no 'random') for drawing and for random pick */
export const SLIDESHOW_TRANSITION_IDS: Exclude<SlideshowTransitionId, 'random'>[] = [
  'fade', 'zoom', 'slideLeft', 'slideRight', 'slideUp', 'slideDown',
  'zoomPan', 'blur', 'scaleDown', 'wipe', 'crossZoom',
]

export type VideoAnimationId =
  | 'none'
  | 'zoomIn'
  | 'zoomOut'
  | 'slowZoomIn'
  | 'slowZoomOut'
  | 'kenBurns'
  | 'panLeft'
  | 'panRight'
  | 'zoomInOut'
  | 'random'

/** Concrete video animation ids (no 'random') for drawing and random pick */
export const VIDEO_ANIMATION_IDS: Exclude<VideoAnimationId, 'random'>[] = [
  'none', 'zoomIn', 'zoomOut', 'slowZoomIn', 'slowZoomOut',
  'zoomInOut', 'kenBurns', 'panLeft', 'panRight',
]

const VIDEO_ANIMATION_LOOP_MS = 20000

/** Optional loopMs: when set (e.g. slideshow seconds per slide), animation completes one cycle in that time. */
function getVideoAnimationTransform(timeMs: number, animation: VideoAnimationId, loopMs?: number): { scale: number; panX: number; panY: number } {
  const loop = loopMs ?? VIDEO_ANIMATION_LOOP_MS
  type Concrete = Exclude<VideoAnimationId, 'random'>
  const resolved: Concrete =
    animation === 'random'
      ? VIDEO_ANIMATION_IDS[Math.floor(timeMs / loop) % VIDEO_ANIMATION_IDS.length]
      : (animation === 'none' || animation == null || (animation as string) === ''
          ? 'none'
          : (animation as Concrete))
  const t = (timeMs % loop) / loop
  const smooth = (x: number) => x * x * (3 - 2 * x)
  switch (resolved) {
    case 'none':
      return { scale: 1, panX: 0, panY: 0 }
    case 'zoomIn':
      return { scale: 1 + smooth(t) * 0.18, panX: 0, panY: 0 }
    case 'zoomOut':
      return { scale: 1.18 - smooth(t) * 0.18, panX: 0, panY: 0 }
    case 'slowZoomIn':
      return { scale: 1 + smooth(t) * 0.1, panX: 0, panY: 0 }
    case 'slowZoomOut':
      return { scale: 1.1 - smooth(t) * 0.1, panX: 0, panY: 0 }
    case 'zoomInOut': {
      const p = Math.sin(t * Math.PI * 2) * 0.5 + 0.5
      return { scale: 1 + smooth(p) * 0.14, panX: 0, panY: 0 }
    }
    case 'kenBurns': {
      const zoom = 1 + 0.16 * (1 - Math.cos(t * Math.PI * 2)) / 2
      const panX = 0.08 * Math.sin(t * Math.PI * 2)
      const panY = 0.06 * Math.cos(t * Math.PI * 2)
      return { scale: zoom, panX, panY }
    }
    case 'panLeft':
      return { scale: 1, panX: -0.1 * smooth(t), panY: 0 }
    case 'panRight':
      return { scale: 1, panX: 0.1 * smooth(t), panY: 0 }
    default: {
      const zoom = 1 + 0.14 * (1 - Math.cos(t * Math.PI * 2)) / 2
      const panX = 0.06 * Math.sin(t * Math.PI * 2)
      const panY = 0.05 * Math.cos(t * Math.PI * 2)
      return { scale: zoom, panX, panY }
    }
  }
}

/** Reel-style face nod: gentle head tilt (rotation) + slight vertical motion. */
function drawFaceNod(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  srcX: number,
  srcY: number,
  srcW: number,
  srcH: number,
  destX: number,
  destY: number,
  destW: number,
  destH: number,
  timeMs: number,
  canvasHeight: number,
  alpha: number
) {
  const nodAngle = 0.055 * Math.sin(timeMs / 420)
  const nodY = canvasHeight * 0.005 * Math.sin(timeMs / 420)
  const cx = destX + destW / 2
  const cy = destY + destH / 2 + nodY
  ctx.save()
  if (alpha < 1) ctx.globalAlpha = alpha
  ctx.translate(cx, cy)
  ctx.rotate(nodAngle)
  ctx.translate(-destW / 2, -destH / 2)
  ctx.drawImage(source, srcX, srcY, srcW, srcH, 0, 0, destW, destH)
  ctx.restore()
}

const PANEL_SLIDE_MS = 1000
const TEXT_STAGGER_MS = 100
const LYRIC_FONT_SCALE = 0.032

/** Lyric line effects for rendering */
type LyricEffects = {
  lineTimeMs: number
  endTimeMs?: number
  currentTimeMs: number
  scale: number
  scriptRes: { x: number; y: number }
  canvasWidth: number
  canvasHeight: number
  zoomEffect?: { t1: number; t2: number; scaleX: number; scaleY: number }
  fadeEffect?: { fadeIn: number; fadeOut: number }
  moveEffect?: { x1: number; y1: number; x2: number; y2: number; t1: number; t2: number }
  karaokeSegments?: { text: string; durationMs: number }[]
}

/** Draw lyric text with outline, shadow, zoom, fade, move, karaoke. */
function drawLyricWithStyle(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  assStyle: AssStyle,
  fallbackColor: string,
  scale: number,
  effects?: LyricEffects
) {
  const lineTimeMs = effects?.lineTimeMs
  const currentTimeMs = effects?.currentTimeMs ?? 0
  const zoomEffect = effects?.zoomEffect
  const fadeEffect = effects?.fadeEffect
  const moveEffect = effects?.moveEffect
  const karaokeSegments = effects?.karaokeSegments
  const scriptRes = effects?.scriptRes ?? { x: 1920, y: 1080 }

  let drawX = x
  let drawY = y
  if (moveEffect && typeof lineTimeMs === 'number') {
    const elapsed = currentTimeMs - lineTimeMs
    const span = moveEffect.t2 - moveEffect.t1
    const t = span > 0 ? Math.min(1, Math.max(0, (elapsed - moveEffect.t1) / span)) : 1
    const sx = (1 - t) * moveEffect.x1 + t * moveEffect.x2
    const sy = (1 - t) * moveEffect.y1 + t * moveEffect.y2
    drawX = (sx / scriptRes.x) * effects!.canvasWidth
    drawY = (sy / scriptRes.y) * effects!.canvasHeight
  }

  let alpha = 1
  if (fadeEffect && typeof lineTimeMs === 'number' && effects?.endTimeMs != null) {
    const elapsed = currentTimeMs - lineTimeMs
    const duration = effects.endTimeMs - lineTimeMs
    if (elapsed < fadeEffect.fadeIn) alpha = elapsed / fadeEffect.fadeIn
    else if (duration - elapsed < fadeEffect.fadeOut) alpha = Math.max(0, (duration - elapsed) / fadeEffect.fadeOut)
  }
  if (alpha < 1) ctx.globalAlpha *= alpha
  const fillColor = assStyle.color ?? fallbackColor
  const scaledOutline = Math.max(0.5, assStyle.outlineWidth * scale)
  const scaledShadow = Math.max(0.5, assStyle.shadowDepth * scale)
  const hasOutline = (assStyle.outlineWidth > 0 || assStyle.outlineColor) && assStyle.outlineColor
  const hasShadow = (assStyle.shadowDepth > 0 || assStyle.shadowColor) && assStyle.shadowColor
  const outlineW = hasOutline ? Math.max(1, scaledOutline) : 0
  const shadowD = hasShadow ? Math.max(1, scaledShadow) : 0

  let zoomScaleX = 1
  let zoomScaleY = 1
  if (zoomEffect && typeof lineTimeMs === 'number') {
    const elapsed = currentTimeMs - lineTimeMs
    const targetX = zoomEffect.scaleX / 100
    const targetY = zoomEffect.scaleY / 100
    if (elapsed >= zoomEffect.t1 && elapsed <= zoomEffect.t2) {
      const span = zoomEffect.t2 - zoomEffect.t1
      const t = span > 0 ? (elapsed - zoomEffect.t1) / span : 1
      zoomScaleX = 1 + (targetX - 1) * t
      zoomScaleY = 1 + (targetY - 1) * t
    } else if (elapsed > zoomEffect.t2) {
      zoomScaleX = targetX
      zoomScaleY = targetY
    }
  }
  const hasZoom = zoomScaleX !== 1 || zoomScaleY !== 1

  if (hasZoom) {
    ctx.save()
    ctx.translate(drawX, drawY)
    ctx.scale(zoomScaleX, zoomScaleY)
    ctx.translate(-drawX, -drawY)
  }

  const primaryColor = assStyle.color ?? fallbackColor
  const secondaryColor = assStyle.secondaryColor ?? primaryColor

  const drawOpaqueBox = (centerX: number, centerY: number, totalWidth: number) => {
    if (assStyle.borderStyle !== 3 || !assStyle.shadowColor) return
    const pad = Math.max(2, outlineW)
    const boxW = totalWidth + pad * 2
    const boxH = (assStyle.fontSize * scale) * 1.4 + pad * 2
    ctx.fillStyle = assStyle.shadowColor
    ctx.fillRect(centerX - boxW / 2, centerY - boxH / 2, boxW, boxH)
  }

  // ASS BorderStyle 3: opaque box behind text (BackColour). Draw first so text sits on top.
  if (karaokeSegments && karaokeSegments.length > 0) {
    const totalW = karaokeSegments.reduce((s, seg) => s + ctx.measureText(seg.text).width, 0)
    drawOpaqueBox(drawX, drawY, totalW)
  } else {
    drawOpaqueBox(drawX, drawY, ctx.measureText(text).width)
  }

  if (karaokeSegments && karaokeSegments.length > 0 && typeof lineTimeMs === 'number') {
    const elapsed = currentTimeMs - lineTimeMs
    let offset = 0
    const totalW = karaokeSegments.reduce((s, seg) => s + ctx.measureText(seg.text).width, 0)
    let segX = drawX - totalW / 2
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    for (const seg of karaokeSegments) {
      const segStart = offset
      const segEnd = offset + seg.durationMs
      offset = segEnd
      const filled = elapsed >= segEnd
      const current = elapsed >= segStart && elapsed < segEnd
      const color = filled || current ? primaryColor : secondaryColor
      if (shadowD > 0) {
        ctx.shadowColor = assStyle.shadowColor!
        ctx.shadowBlur = shadowD * 2
        ctx.shadowOffsetX = shadowD * 0.6
        ctx.shadowOffsetY = shadowD * 0.6
      }
      if (outlineW > 0 && seg.text) {
        ctx.strokeStyle = assStyle.outlineColor!
        ctx.lineWidth = outlineW
        ctx.lineJoin = 'round'
        ctx.miterLimit = 2
        ctx.strokeText(seg.text, segX, drawY)
      }
      if (seg.text) {
        ctx.fillStyle = color
        ctx.fillText(seg.text, segX, drawY)
        segX += ctx.measureText(seg.text).width
      }
    }
    if (shadowD > 0) {
      ctx.shadowBlur = 0
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 0
    }
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (hasZoom) ctx.restore()
    if (alpha < 1) ctx.globalAlpha /= alpha
    return
  }

  if (shadowD > 0) {
    ctx.shadowColor = assStyle.shadowColor!
    ctx.shadowBlur = shadowD * 2
    ctx.shadowOffsetX = shadowD * 0.6
    ctx.shadowOffsetY = shadowD * 0.6
  }
  if (outlineW > 0) {
    ctx.strokeStyle = assStyle.outlineColor!
    ctx.lineWidth = outlineW
    ctx.lineJoin = 'round'
    ctx.miterLimit = 2
    ctx.strokeText(text, drawX, drawY)
  }
  ctx.fillStyle = primaryColor
  ctx.fillText(text, drawX, drawY)
  if (shadowD > 0) {
    ctx.shadowBlur = 0
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0
  }
  if (hasZoom) ctx.restore()
  if (alpha < 1) ctx.globalAlpha /= alpha
}

/** Apply ASS style to ctx and return draw position + scale. scriptRes used to scale fontSize and margins. */
function applyAssStyle(
  ctx: CanvasRenderingContext2D,
  assStyle: AssStyle,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  canvasHeight: number,
  scriptRes?: { x: number; y: number }
): { x: number; y: number; scale: number } {
  const res = scriptRes ?? { x: 1920, y: 1080 }
  const scale = canvasHeight / res.y
  const fontSize = Math.round(assStyle.fontSize * scale)
  const ml = assStyle.marginL * scale
  const mr = assStyle.marginR * scale
  const mv = assStyle.marginV * scale
  const fontParts = [
    assStyle.italic ? 'italic' : '',
    assStyle.bold ? 'bold' : '',
    `${fontSize}px`,
    assStyle.fontName || 'Arial',
  ].filter(Boolean)
  ctx.font = (fontParts.join(' ') || `${fontSize}px Arial`) as string
  const alignMap: Record<number, CanvasTextAlign> = {
    1: 'left', 4: 'left', 7: 'left',
    2: 'center', 5: 'center', 8: 'center',
    3: 'right', 6: 'right', 9: 'right',
  }
  const baselineMap: Record<number, CanvasTextBaseline> = {
    1: 'bottom', 2: 'bottom', 3: 'bottom',
    4: 'middle', 5: 'middle', 6: 'middle',
    7: 'top', 8: 'top', 9: 'top',
  }
  ctx.textAlign = alignMap[assStyle.alignment] ?? 'center'
  ctx.textBaseline = baselineMap[assStyle.alignment] ?? 'middle'
  let x: number
  let y: number
  const a = assStyle.alignment
  if (a === 1 || a === 4 || a === 7) x = boxX + ml
  else if (a === 3 || a === 6 || a === 9) x = boxX + boxW - mr
  else x = boxX + boxW / 2
  if (a === 1 || a === 2 || a === 3) y = boxY + boxH - mv
  else if (a === 7 || a === 8 || a === 9) y = boxY + mv
  else y = boxY + boxH / 2
  return { x, y, scale }
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  opts: {
    width: number
    height: number
    timeMs: number
    durationMs: number
    style: VideoStyleId
    image: HTMLImageElement | null
    /** When set, used as main full-screen and card art instead of image (e.g. user uploaded video) */
    frontVideo?: HTMLVideoElement | null
    title: string
    artist: string
    album: string
    /** Parsed lyrics: synced (LRC) or plain. Replaces legacy lyricsLines. */
    lyricsParsed?: ParsedLyrics
    spectrumBars?: number[] | null
    audioLevel?: number
    visualizer?: VisualizerId
    backgroundEffect?: BackgroundEffectId
    particleEffect?: ParticleEffectId
    imageOpacityWithEffect?: number
    /** When set, drawn first (looping); then front image uses frontImageOpacityWhenVideo */
    backgroundVideo?: HTMLVideoElement | null
    frontImageOpacityWhenVideo?: number
    visualizerSize?: 'small' | 'medium' | 'large' | 'full'
    visualizerPosition?: 'top' | 'aboveCard' | 'center'
    /** Where to show lyrics when present: in card or on screen overlay */
    lyricPosition?: 'card' | 'screen'
    /** Optional lyric style overrides (font, colors, outline). Merged with ASS style. */
    lyricStyleOverrides?: LyricStyleOverrides | null
    /** Where to show visualizer: in card or on video/screen */
    visualizerPlacement?: 'card' | 'screen'
    /** Instrumental mode: cover-focused animation with Ken Burns and full-width visualizer */
    instrumental?: boolean
    /** Card/box style: slide, fadeUp, scale, pill, glass */
    cardStyle?: CardStyleId
    /** When set, the info card will start to disappear after this many seconds using the same animation mirrored */
    cardAutoHideSeconds?: number
    /** Slideshow: multiple images with transitions */
    slideshowImages?: HTMLImageElement[] | null
    slideshowCurrentIndex?: number
    slideshowTransitionProgress?: number
    slideshowTransition?: SlideshowTransitionId
    /** Duration in ms each slide is shown (for per-slide animation cycle) */
    slideshowSlideDurationMs?: number
    /** When main media is video: animation (zoom/pan) applied over time */
    videoAnimation?: VideoAnimationId
    /** Face box in source image pixels for nod animation (optional) */
    faceBox?: { x: number; y: number; width: number; height: number } | null
    /** Pre-converted anime frames (when convertToAnime was used on video); intervalMs between frames */
    animeFrames?: { images: HTMLImageElement[]; intervalMs: number } | null
  }
) {
  if (opts.instrumental) {
    drawInstrumentalFrame(ctx, opts)
    return
  }
  const { width, height, timeMs, durationMs, style, image, frontVideo, title, artist, album, lyricsParsed, spectrumBars, audioLevel, visualizer, backgroundEffect, particleEffect, imageOpacityWithEffect, backgroundVideo, frontImageOpacityWhenVideo, visualizerSize, visualizerPosition, lyricPosition = 'card', visualizerPlacement = 'screen', lyricStyleOverrides, cardStyle, cardAutoHideSeconds, slideshowImages, slideshowCurrentIndex = 0, slideshowTransitionProgress = 0, slideshowTransition = 'fade', slideshowSlideDurationMs, videoAnimation: videoAnimationOpt = 'kenBurns', faceBox, animeFrames } = opts
  const videoAnimation = videoAnimationOpt ?? 'kenBurns'
  const hasSlideshow = slideshowImages && slideshowImages.length > 0
  const hasImage = !!(image && image.complete && image.naturalWidth > 0)
  const hasAnimeFrames = animeFrames?.images?.length
  const wantsVideoAsMain = (!!frontVideo || !!hasAnimeFrames) && !hasSlideshow && !hasImage
  const mainVisual = hasSlideshow ? 'slideshow' : hasImage ? 'image' : wantsVideoAsMain ? 'video' : null
  type VideoSource =
    | { type: 'video'; video: HTMLVideoElement; w: number; h: number }
    | { type: 'anime'; img: HTMLImageElement; w: number; h: number }
    | { type: 'animeBlend'; img1: HTMLImageElement; img2: HTMLImageElement; alpha: number; w: number; h: number }
  const videoFrameSource = (): VideoSource | null => {
    if (hasAnimeFrames && animeFrames && animeFrames.images.length > 0) {
      const t = timeMs / animeFrames.intervalMs
      const idx0 = Math.min(Math.floor(t), animeFrames.images.length - 1)
      const idx1 = Math.min(idx0 + 1, animeFrames.images.length - 1)
      const alpha = t % 1
      const img1 = animeFrames.images[idx0]
      const img2 = animeFrames.images[idx1]
      if (img1?.complete && img1.naturalWidth > 0) {
        if (idx1 !== idx0 && img2?.complete && img2.naturalWidth > 0 && alpha > 0.001) {
          return { type: 'animeBlend', img1, img2, alpha, w: img1.naturalWidth, h: img1.naturalHeight }
        }
        return { type: 'anime', img: img1, w: img1.naturalWidth, h: img1.naturalHeight }
      }
    }
    if (frontVideo && frontVideo.videoWidth > 0 && frontVideo.videoHeight > 0) return { type: 'video', video: frontVideo, w: frontVideo.videoWidth, h: frontVideo.videoHeight }
    return null
  }
  /** Single image for card when main is anime video (no animation in card). */
  const cardImageForVideo = (): HTMLImageElement | null => {
    if (hasAnimeFrames && animeFrames?.images?.length) return animeFrames.images[0]
    return null
  }
  const vizSize = visualizerSize ?? 'medium'
  const cardStyleId = cardStyle ?? 'slide'
  const vizPos = visualizerPosition ?? 'aboveCard'
  const vizId: VisualizerId = visualizer ?? 'bars'
  const hasAudio = spectrumBars && spectrumBars.length > 0
  const level = typeof audioLevel === 'number' ? audioLevel : 0.12 + 0.08 * Math.sin(timeMs / 200)
  const idleBars = Array.from({ length: 48 }, (_, i) => 0.2 + 0.25 * Math.sin(timeMs / 130 + i * 0.18))
  const bars = hasAudio ? spectrumBars : idleBars
  const theme = getVideoStyleTheme(style)
  const t = timeMs / 1000
  const hasBgEffect = backgroundEffect && backgroundEffect !== 'none'
  const hasBgVideo = backgroundVideo && backgroundVideo.readyState >= 1 && backgroundVideo.videoWidth > 0 && backgroundVideo.videoHeight > 0

  // —— 0) Optional background video (loop) ——
  if (hasBgVideo && backgroundVideo) {
    const vw = backgroundVideo.videoWidth
    const vh = backgroundVideo.videoHeight
    if (vw > 0 && vh > 0) {
      const scale = Math.max(width / vw, height / vh)
      const sx = (vw - width / scale) / 2
      const sy = (vh - height / scale) / 2
      ctx.drawImage(backgroundVideo, sx, sy, width / scale, height / scale, 0, 0, width, height)
    }
  }

  // —— 1) Full-screen background (image or gradient); when background video is on, image uses frontImageOpacityWhenVideo ——
  const imageOpacity = hasBgVideo
    ? (typeof frontImageOpacityWhenVideo === 'number' ? frontImageOpacityWhenVideo : 0.7)
    : hasBgEffect && typeof imageOpacityWithEffect === 'number'
      ? imageOpacityWithEffect
      : 1

  if (mainVisual === 'slideshow' && slideshowImages && slideshowImages.length > 0) {
    const currentImg = slideshowImages[slideshowCurrentIndex % slideshowImages.length]
    const nextIndex = (slideshowCurrentIndex + 1) % slideshowImages.length
    const nextImg = slideshowImages[nextIndex]
    const progress = easeOutQuart(Math.min(1, Math.max(0, slideshowTransitionProgress)))
    const slideDurationMs = slideshowSlideDurationMs ?? 5000
    const timeInSlide = timeMs % slideDurationMs
    const slideAnim = getVideoAnimationTransform(timeInSlide, videoAnimation, slideDurationMs)
    drawSlideshowLayer(ctx, width, height, currentImg, progress ? nextImg : null, progress, slideshowTransition, imageOpacity, slideAnim)
    if (faceBox && faceBox.width > 0 && faceBox.height > 0 && currentImg.complete && currentImg.naturalWidth > 0) {
      const iw = currentImg.naturalWidth
      const ih = currentImg.naturalHeight
      const baseScale = Math.max(width / iw, height / ih)
      const sw = width / baseScale
      const sh = height / baseScale
      const sx = (iw - sw) / 2
      const sy = (ih - sh) / 2
      const visSx = Math.max(faceBox.x, sx)
      const visSy = Math.max(faceBox.y, sy)
      const visSw = Math.min(faceBox.x + faceBox.width, sx + sw) - visSx
      const visSh = Math.min(faceBox.y + faceBox.height, sy + sh) - visSy
      if (visSw > 0 && visSh > 0) {
        const faceDestX = ((visSx - sx) / sw) * width
        const faceDestY = ((visSy - sy) / sh) * height
        const faceDestW = (visSw / sw) * width
        const faceDestH = (visSh / sh) * height
        drawFaceNod(ctx, currentImg, visSx, visSy, visSw, visSh, faceDestX, faceDestY, faceDestW, faceDestH, timeMs, height, imageOpacity * (1 - progress * 0.99))
      }
    }
  } else if (mainVisual === 'image' && image) {
    ctx.save()
    if (imageOpacity < 1) ctx.globalAlpha = imageOpacity
    const anim = getVideoAnimationTransform(timeMs, videoAnimation, 10000)
    const baseScale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
    const coverScale = baseScale * anim.scale
    const sw = width / coverScale
    const sh = height / coverScale
    const sx = (image.naturalWidth - sw) / 2 + anim.panX * image.naturalWidth
    const sy = (image.naturalHeight - sh) / 2 + anim.panY * image.naturalHeight
    if (faceBox && faceBox.width > 0 && faceBox.height > 0) {
      const visSx = Math.max(faceBox.x, sx)
      const visSy = Math.max(faceBox.y, sy)
      const visSw = Math.min(faceBox.x + faceBox.width, sx + sw) - visSx
      const visSh = Math.min(faceBox.y + faceBox.height, sy + sh) - visSy
      if (visSw > 0 && visSh > 0) {
        const faceDestX = ((visSx - sx) / sw) * width
        const faceDestY = ((visSy - sy) / sh) * height
        const faceDestW = (visSw / sw) * width
        const faceDestH = (visSh / sh) * height
        ctx.save()
        ctx.beginPath()
        ctx.rect(0, 0, width, faceDestY)
        ctx.rect(0, faceDestY + faceDestH, width, height - faceDestY - faceDestH)
        ctx.rect(0, faceDestY, faceDestX, faceDestH)
        ctx.rect(faceDestX + faceDestW, faceDestY, width - faceDestX - faceDestW, faceDestH)
        ctx.clip()
        ctx.drawImage(image, sx, sy, sw, sh, 0, 0, width, height)
        ctx.restore()
        drawFaceNod(ctx, image, visSx, visSy, visSw, visSh, faceDestX, faceDestY, faceDestW, faceDestH, timeMs, height, 1)
      } else {
        ctx.drawImage(image, sx, sy, sw, sh, 0, 0, width, height)
      }
    } else {
      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, width, height)
    }
    ctx.restore()
  } else if (mainVisual === 'video') {
    const src = videoFrameSource()
    if (src) {
      const vw = src.w
      const vh = src.h
      ctx.save()
      if (imageOpacity < 1) ctx.globalAlpha = imageOpacity
      const anim = getVideoAnimationTransform(timeMs, videoAnimation, 10000)
      const baseScale = Math.max(width / vw, height / vh)
      const coverScale = baseScale * anim.scale
      const sw = width / coverScale
      const sh = height / coverScale
      const sx = (vw - sw) / 2 + anim.panX * vw
      const sy = (vh - sh) / 2 + anim.panY * vh
      if (src.type === 'video') {
        ctx.drawImage(src.video, sx, sy, sw, sh, 0, 0, width, height)
      } else if (src.type === 'animeBlend') {
        ctx.drawImage(src.img1, sx, sy, sw, sh, 0, 0, width, height)
        ctx.globalAlpha *= src.alpha
        ctx.drawImage(src.img2, sx, sy, sw, sh, 0, 0, width, height)
      } else {
        ctx.drawImage(src.img, sx, sy, sw, sh, 0, 0, width, height)
      }
      ctx.restore()
    }
  } else if (!hasBgVideo) {
    const gr = ctx.createLinearGradient(0, 0, width, height)
    gr.addColorStop(0, '#1a1a2e')
    gr.addColorStop(0.5, '#16213e')
    gr.addColorStop(1, '#0f3460')
    ctx.fillStyle = gr
    ctx.fillRect(0, 0, width, height)
  }
  ctx.fillStyle = 'rgba(0,0,0,0.2)'
  ctx.fillRect(0, 0, width, height)

  // —— Background effect (fire/snow/fog etc.) over the video with low opacity ——
  drawBackgroundEffect(ctx, backgroundEffect ?? 'none', width, height, timeMs)
  // —— 3D particles (separate layer with depth, perspective, shadows) ——
  drawParticleEffect(ctx, particleEffect ?? 'none', width, height, timeMs)

  const margin = width * 0.04
  const parsed: ParsedLyrics = lyricsParsed ?? { type: 'plain', lines: [] }
  const hasSynced = parsed.type === 'synced' && parsed.lines.length > 0
  const hasPlain = parsed.type === 'plain' && parsed.lines.length > 0
  const scriptRes = hasSynced && parsed.type === 'synced' && 'scriptRes' in parsed ? parsed.scriptRes : undefined
  const hasLyrics = hasSynced || hasPlain
  const lyricsOnCard = hasLyrics && lyricPosition === 'card'
  const lyricsOnScreen = hasLyrics && lyricPosition === 'screen'
  /** Lyrics on card are drawn inside the card block. When card style is "None", that block is skipped — draw lyrics as full-screen overlay instead. */
  const lyricsOverlayWhenNoCard = hasLyrics && lyricPosition === 'card' && cardStyleId === 'none'
  const showLyricsOverlay = lyricsOnScreen || lyricsOverlayWhenNoCard
  const vizOnScreen = visualizerPlacement === 'screen'
  const vizInCard = visualizerPlacement === 'card'
  const cardInsetX = width * 0.02
  // Card timing: optional auto-hide after N seconds, using the same entrance animation mirrored for exit.
  let cardVisible = true
  let cardTimeForAnim = timeMs
  if (cardStyleId !== 'none' && typeof cardAutoHideSeconds === 'number' && cardAutoHideSeconds > 0) {
    const hideStartMs = cardAutoHideSeconds * 1000
    if (timeMs >= hideStartMs) {
      const elapsedSinceHide = timeMs - hideStartMs
      if (elapsedSinceHide >= CARD_ENTRANCE_MS) {
        cardVisible = false
      } else {
        cardTimeForAnim = Math.max(0, CARD_ENTRANCE_MS - elapsedSinceHide)
      }
    }
  }
  const cardAnim = getCardAnimation(cardStyleId, cardTimeForAnim, width, height, margin)
  const { drawX: drawCardX, drawY: cardY, cardW, cardH, scale: cardScale, alpha: cardAlpha, radius: cardRadius, useGlass: cardUseGlass, useNeon: cardUseNeon } = cardAnim

  // —— Visualizer on video (strip or full area) when visualizer placement is screen ——
  const isFullSize = vizSize === 'full'
  const vizHeightScale = vizSize === 'small' ? 0.08 : vizSize === 'large' ? 0.18 : vizSize === 'full' ? 0.9 : 0.12
  const vizWidthScale = vizSize === 'small' ? 0.85 : vizSize === 'full' ? 0.9 : 1
  if (vizOnScreen) {
    const videoVizH = height * vizHeightScale
    const videoVizW = isFullSize ? width * vizWidthScale : (width - margin * 2) * vizWidthScale
    const videoVizX = isFullSize ? (width - videoVizW) / 2 : margin + ((width - margin * 2) - videoVizW) / 2
    let videoVizY: number
    if (isFullSize) {
      videoVizY = (height - videoVizH) / 2
    } else if (vizPos === 'top') {
      videoVizY = height * 0.04
    } else if (vizPos === 'center') {
      videoVizY = (height - videoVizH) / 2
    } else {
      const gapAboveCard = 10
      videoVizY = cardY - videoVizH - gapAboveCard
    }
    ctx.save()
    roundRect(ctx, videoVizX, videoVizY, videoVizW, videoVizH, 14)
    ctx.clip()
    drawVisualizer(ctx, vizId, { x: videoVizX, y: videoVizY, w: videoVizW, h: videoVizH }, bars, level, theme, timeMs, { boostVisibility: true })
    ctx.restore()
  }

  if (cardStyleId !== 'none' && cardVisible) {
  // —— 2) Volume bar (inside card, left edge) ——
  const volBarW = width * 0.02
  const volBarH = cardH * 0.45
  const volX = drawCardX + cardInsetX
  const volY = cardY + (cardH - volBarH) / 2

  ctx.save()
  ctx.globalAlpha *= cardAlpha
  if (cardScale !== 1) {
    const cx = drawCardX + cardW / 2
    const cy = cardY + cardH / 2
    ctx.translate(cx, cy)
    ctx.scale(cardScale, cardScale)
    ctx.translate(-cx, -cy)
  }

  const volFill = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(t * 1.8))
  ctx.save()
  roundRect(ctx, volX, volY, volBarW, volBarH, 8)
  ctx.fillStyle = theme.volumeBg
  ctx.fill()
  ctx.clip()
  ctx.fillStyle = theme.volumeFill
  ctx.fillRect(volX, volY + volBarH * (1 - volFill), volBarW, volBarH * volFill)
  ctx.restore()
  ctx.strokeStyle = theme.volumeStroke
  ctx.lineWidth = 1.5
  roundRect(ctx, volX, volY, volBarW, volBarH, 8)
  ctx.stroke()

  const iconSize = Math.min(volBarW * 0.75, 24)
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  drawSpeakerIcon(ctx, volX + volBarW / 2 - iconSize / 2, volY + iconSize * 0.7, iconSize)

  // —— 3) ONE CARD at bottom: volume | album art | song details (half) | lyrics (half) ——
  const artInset = cardH * 0.055
  const artSize = cardH - artInset * 2
  const contentLeft = drawCardX + cardInsetX + volBarW + artInset + artSize + artInset
  const contentWidth = cardW - (contentLeft - drawCardX) - artInset
  // Details get left half; right half: lyrics (if on card), visualizer (if in card), or both (stacked)
  const detailsWidth = contentWidth * 0.5
  const rightHalfWidth = contentWidth * 0.5

  // Card background – theme gradient (or glass) + shadow
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = 24
  ctx.shadowOffsetY = 4
  roundRect(ctx, drawCardX, cardY, cardW, cardH, cardRadius)
  if (cardUseGlass) {
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'
  } else {
    const cardGradient = ctx.createLinearGradient(drawCardX, cardY, drawCardX + cardW, cardY + cardH)
    theme.cardGradientStops.forEach(([stop, color]) => cardGradient.addColorStop(stop, color))
    ctx.fillStyle = cardGradient
    ctx.fill()
    ctx.strokeStyle = theme.cardStroke
  }
  ctx.restore()
  ctx.lineWidth = cardUseNeon ? 2.5 : 1.5
  if (cardUseNeon) {
    const [nr, ng, nb] = theme.artGlowColor.split(',').map(Number)
    ctx.save()
    ctx.strokeStyle = `rgba(${nr},${ng},${nb},0.95)`
    ctx.shadowColor = `rgba(${nr},${ng},${nb},0.9)`
    ctx.shadowBlur = 20
    roundRect(ctx, drawCardX, cardY, cardW, cardH, cardRadius)
    ctx.stroke()
    ctx.shadowBlur = 0
    ctx.restore()
  }
  ctx.strokeStyle = theme.cardStroke
  roundRect(ctx, drawCardX, cardY, cardW, cardH, cardRadius)
  ctx.stroke()

  // —— Beat-synced animation OUTSIDE card (glow aura + ring + corner accents) ——
  const pulse = 0.35 + 0.65 * level
  const [r, g, b] = theme.artGlowColor.split(',').map(Number)
  const outPad = cardUseNeon ? 20 : 16
  const outR = cardUseNeon ? 30 : 26
  const pulsePad = outPad + pulse * (cardUseNeon ? 20 : 16)
  ctx.save()
  ctx.globalAlpha = cardUseNeon ? 0.4 + 0.4 * pulse : 0.2 + 0.35 * pulse
  ctx.strokeStyle = `rgba(${r},${g},${b},0.9)`
  ctx.lineWidth = cardUseNeon ? 4 : 3
  ctx.filter = `blur(${cardUseNeon ? 12 + pulse * 8 : 8 + pulse * 6}px)`
  roundRect(ctx, drawCardX - pulsePad, cardY - pulsePad, cardW + pulsePad * 2, cardH + pulsePad * 2, outR + 4)
  ctx.stroke()
  ctx.restore()
  ctx.save()
  ctx.shadowColor = `rgba(${r},${g},${b},${0.3 + 0.5 * pulse})`
  ctx.shadowBlur = 15 + pulse * 20
  ctx.strokeStyle = `rgba(${r},${g},${b},${0.2 + 0.5 * pulse})`
  ctx.lineWidth = 2.5 + pulse * 1.5
  roundRect(ctx, drawCardX - outPad, cardY - outPad, cardW + outPad * 2, cardH + outPad * 2, outR)
  ctx.stroke()
  ctx.restore()
  ctx.save()
  ctx.strokeStyle = `rgba(${r},${g},${b},${0.5 + 0.45 * pulse})`
  ctx.lineWidth = 1.5
  roundRect(ctx, drawCardX - outPad, cardY - outPad, cardW + outPad * 2, cardH + outPad * 2, outR)
  ctx.stroke()
  ctx.restore()
  const cornerRadius = 6 + pulse * 4
  const corners = [
    [drawCardX - outPad, cardY - outPad],
    [drawCardX + cardW + outPad, cardY - outPad],
    [drawCardX + cardW + outPad, cardY + cardH + outPad],
    [drawCardX - outPad, cardY + cardH + outPad],
  ]
  corners.forEach(([cx_, cy_]) => {
    ctx.save()
    ctx.fillStyle = `rgba(${r},${g},${b},${0.4 + 0.5 * pulse})`
    ctx.beginPath()
    ctx.arc(cx_, cy_, cornerRadius, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  })

  // Album art inside card
  const artX = drawCardX + cardInsetX + volBarW + artInset
  const artY = cardY + artInset
  const float = 1 + 0.012 * Math.sin(t * 1.2)
  const glowPulse = 0.1 + 0.05 * Math.sin(t * 2)
  const artSizeScaled = artSize * float
  const artOffset = (artSizeScaled - artSize) / 2

  ctx.save()
  ctx.shadowColor = `rgba(${theme.artGlowColor},${glowPulse})`
  ctx.shadowBlur = 18
  roundRect(ctx, artX - artOffset, artY - artOffset, artSizeScaled, artSizeScaled, 12)
  ctx.fillStyle = 'rgba(18,28,22,0.98)'
  ctx.fill()
  const cardImage = mainVisual === 'slideshow' && slideshowImages?.length
    ? slideshowImages[0]
    : image
  if (mainVisual === 'image' && image) {
    ctx.save()
    roundRect(ctx, artX - artOffset, artY - artOffset, artSizeScaled, artSizeScaled, 12)
    ctx.clip()
    const scale = Math.max(artSizeScaled / image.naturalWidth, artSizeScaled / image.naturalHeight)
    const sx = (image.naturalWidth - artSizeScaled / scale) / 2
    const sy = (image.naturalHeight - artSizeScaled / scale) / 2
    ctx.drawImage(image, sx, sy, artSizeScaled / scale, artSizeScaled / scale, artX - artOffset, artY - artOffset, artSizeScaled, artSizeScaled)
    ctx.restore()
  } else if (mainVisual === 'slideshow' && cardImage && cardImage.complete && cardImage.naturalWidth > 0) {
    ctx.save()
    roundRect(ctx, artX - artOffset, artY - artOffset, artSizeScaled, artSizeScaled, 12)
    ctx.clip()
    ctx.drawImage(
      cardImage,
      0, 0, cardImage.naturalWidth, cardImage.naturalHeight,
      artX - artOffset, artY - artOffset, artSizeScaled, artSizeScaled
    )
    ctx.restore()
  } else if (mainVisual === 'video') {
    const cardImg = cardImageForVideo()
    if (cardImg && cardImg.complete && cardImg.naturalWidth > 0) {
      ctx.save()
      roundRect(ctx, artX - artOffset, artY - artOffset, artSizeScaled, artSizeScaled, 12)
      ctx.clip()
      const vw = cardImg.naturalWidth
      const vh = cardImg.naturalHeight
      const scale = Math.max(artSizeScaled / vw, artSizeScaled / vh)
      const sx = (vw - artSizeScaled / scale) / 2
      const sy = (vh - artSizeScaled / scale) / 2
      ctx.drawImage(cardImg, sx, sy, artSizeScaled / scale, artSizeScaled / scale, artX - artOffset, artY - artOffset, artSizeScaled, artSizeScaled)
      ctx.restore()
    } else {
      const src = videoFrameSource()
      if (src) {
        const vw = src.w
        const vh = src.h
        ctx.save()
        roundRect(ctx, artX - artOffset, artY - artOffset, artSizeScaled, artSizeScaled, 12)
        ctx.clip()
        const scale = Math.max(artSizeScaled / vw, artSizeScaled / vh)
        const sx = (vw - artSizeScaled / scale) / 2
        const sy = (vh - artSizeScaled / scale) / 2
        if (src.type === 'video') ctx.drawImage(src.video, sx, sy, artSizeScaled / scale, artSizeScaled / scale, artX - artOffset, artY - artOffset, artSizeScaled, artSizeScaled)
        else if (src.type === 'animeBlend') {
          ctx.drawImage(src.img1, sx, sy, artSizeScaled / scale, artSizeScaled / scale, artX - artOffset, artY - artOffset, artSizeScaled, artSizeScaled)
          ctx.globalAlpha = src.alpha
          ctx.drawImage(src.img2, sx, sy, artSizeScaled / scale, artSizeScaled / scale, artX - artOffset, artY - artOffset, artSizeScaled, artSizeScaled)
        } else ctx.drawImage(src.img, sx, sy, artSizeScaled / scale, artSizeScaled / scale, artX - artOffset, artY - artOffset, artSizeScaled, artSizeScaled)
        ctx.restore()
      }
    }
  }
  ctx.shadowBlur = 0
  ctx.strokeStyle = 'rgba(0,0,0,0.1)'
  ctx.lineWidth = 1
  roundRect(ctx, artX - artOffset, artY - artOffset, artSizeScaled, artSizeScaled, 12)
  ctx.stroke()
  ctx.restore()

  const pad = width * 0.018
  const contentStart = PANEL_SLIDE_MS + 150
  const titleAlpha = easeOutCubic(Math.min(1, (timeMs - contentStart) / 350))
  const albumAlpha = easeOutCubic(Math.min(1, (timeMs - contentStart - TEXT_STAGGER_MS) / 300))
  const artistAlpha = easeOutCubic(Math.min(1, (timeMs - contentStart - TEXT_STAGGER_MS * 2) / 300))

  // Song details – title one line, font size scales with title length
  let textY = cardY + cardH * 0.16
  const titleMaxWidth = detailsWidth - pad * 2
  const titleSizeMin = Math.round(Math.min(width, height) * 0.028)
  const titleSizeMax = Math.round(Math.min(width, height) * 0.062)
  const titleSize = getTitleFontSize(ctx, title, titleMaxWidth, titleSizeMax, titleSizeMin, theme)
  ctx.font = `${theme.titleStyle} ${theme.titleWeight} ${titleSize}px ${theme.titleFont}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = `${theme.titleColor}${titleAlpha})`
  ctx.fillText(title, contentLeft + pad, textY)
  textY += titleSize * 1.35

  const subSize = Math.round(Math.min(width, height) * 0.038)
  ctx.font = `${theme.bodyStyle} ${theme.bodyWeight} ${subSize}px ${theme.subtitleFont}`
  ctx.fillStyle = `${theme.subtitleColor}${albumAlpha})`
  if (album) {
    wrapAndDraw(ctx, `Album: ${album}`, contentLeft + pad, textY, detailsWidth - pad * 2, subSize * 1.2)
    textY += subSize * 2
  } else {
    textY += subSize * 0.5
  }

  const labelSize = Math.round(subSize * 0.85)
  const artistNameSize = Math.round(subSize * 1.05)
  ctx.font = `${theme.bodyStyle} ${theme.bodyWeight} ${labelSize}px ${theme.artistFont}`
  ctx.fillStyle = `${theme.artistColor}${artistAlpha})`
  ctx.fillText('Artist', contentLeft + pad, textY)
  textY += labelSize * 1.4
  if (artist) {
    ctx.font = `${theme.bodyStyle} ${theme.bodyWeight} ${artistNameSize}px ${theme.artistFont}`
    ctx.fillStyle = `${theme.artistColor}${artistAlpha})`
    ctx.fillText(artist, contentLeft + pad, textY)
  }

  // Visualizer in card (right half, or bottom portion when lyrics also in card)
  const cardVizScale = vizSize === 'small' ? 0.85 : vizSize === 'large' || vizSize === 'full' ? 1 : 1
  if (vizInCard) {
    const vizAreaW = contentWidth - detailsWidth - pad
    const vizAreaH = cardH * (lyricsOnCard ? 0.45 : 0.72)
    const baseVizW = vizAreaW * cardVizScale
    const baseVizH = vizAreaH * cardVizScale
    const vizBoxX = contentLeft + detailsWidth + pad * 0.5 + (vizAreaW - baseVizW) / 2
    const vizBoxY = lyricsOnCard
      ? cardY + cardH * 0.55 + (cardH * 0.45 - baseVizH) / 2
      : cardY + (cardH - baseVizH) / 2
    const vizBoxW = baseVizW
    const vizBoxH = baseVizH
    ctx.save()
    roundRect(ctx, vizBoxX, vizBoxY, vizBoxW, vizBoxH, 14)
    ctx.fillStyle = theme.lyricBoxBg
    ctx.fill()
    ctx.strokeStyle = theme.lyricBoxStroke
    ctx.lineWidth = 1.5
    ctx.stroke()
    roundRect(ctx, vizBoxX, vizBoxY, vizBoxW, vizBoxH, 14)
    ctx.clip()
    drawVisualizer(ctx, vizId, { x: vizBoxX, y: vizBoxY, w: vizBoxW, h: vizBoxH }, bars, level, theme, timeMs)
    ctx.restore()
  }

  // Lyrics in card (right half, or top portion when visualizer also in card)
  if (lyricsOnCard) {
    const lyricBoxLeft = contentLeft + detailsWidth + pad * 0.5
    const lyricBoxW = rightHalfWidth - pad
    const lyricBoxH = vizInCard ? cardH * 0.55 : cardH * 1.14
    const lyricBoxY = vizInCard ? cardY : cardY + (cardH - lyricBoxH) / 2
    const lyricFontSize = Math.round(Math.min(width, height) * LYRIC_FONT_SCALE)
    const lineHeight = lyricFontSize * 1.35
    const cx = lyricBoxLeft + lyricBoxW / 2
    const cy = lyricBoxY + lyricBoxH / 2

    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.2)'
    ctx.shadowBlur = 10
    ctx.shadowOffsetY = 2
    roundRect(ctx, lyricBoxLeft, lyricBoxY, lyricBoxW, lyricBoxH, 14)
    ctx.fillStyle = theme.lyricBoxBg
    ctx.fill()
    ctx.strokeStyle = theme.lyricBoxStroke
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.restore()

    ctx.save()
    roundRect(ctx, lyricBoxLeft, lyricBoxY, lyricBoxW, lyricBoxH, 14)
    ctx.clip()
    if (hasSynced) {
      const idx = getCurrentLineIndex(parsed.lines, timeMs)
      const lyricLine = idx >= 0 ? parsed.lines[idx] : null
      if (lyricLine?.text) {
        const resolvedStyle = mergeLyricStyleOverrides(lyricLine.assStyle ?? null, lyricStyleOverrides)
        let drawX = cx
        let drawY = cy
        if (resolvedStyle) {
          const pos = applyAssStyle(ctx, resolvedStyle, lyricBoxLeft, lyricBoxY, lyricBoxW, lyricBoxH, height, scriptRes)
          drawX = pos.x
          drawY = pos.y
          const effects: LyricEffects = {
            lineTimeMs: lyricLine.timeMs,
            endTimeMs: lyricLine.endTimeMs,
            currentTimeMs: timeMs,
            scale: pos.scale,
            scriptRes: scriptRes ?? { x: 1920, y: 1080 },
            canvasWidth: width,
            canvasHeight: height,
            zoomEffect: lyricLine.zoomEffect,
            fadeEffect: lyricLine.fadeEffect,
            moveEffect: lyricLine.moveEffect,
            karaokeSegments: lyricLine.karaokeSegments,
          }
          drawLyricWithStyle(ctx, lyricLine.text, drawX, drawY, resolvedStyle, theme.lyricTextColor, pos.scale, effects)
        } else {
          ctx.font = `${theme.bodyStyle} 500 ${lyricFontSize}px ${theme.lyricFont}`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillStyle = lyricLine.color ?? theme.lyricTextColor
          ctx.fillText(lyricLine.text, drawX, drawY)
        }
      }
    } else {
      ctx.font = `${theme.bodyStyle} 500 ${lyricFontSize}px ${theme.lyricFont}`
      ctx.fillStyle = theme.lyricTextColor
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const plainLines = parsed.type === 'plain' ? parsed.lines : []
      const totalLines = plainLines.length
      const lineDurationMs = Math.max(1, Math.floor(durationMs / Math.max(1, totalLines)))
      const lineIndex = Math.floor(timeMs / lineDurationMs)
      const scrollOffset = totalLines > 0 ? (timeMs % lineDurationMs) / lineDurationMs : 0
      const bottomY = lyricBoxY + lyricBoxH
      const bottomCenterY = bottomY - lineHeight / 2
      const drawLyricLine = (line: string, y: number) => {
        if (y < lyricBoxY - lineHeight || y > bottomY + lineHeight) return
        ctx.fillText(line, cx, y)
      }
      for (let k = 0; k <= 6; k++) {
        const i = (lineIndex - k + totalLines * 10) % totalLines
        const y = bottomCenterY - scrollOffset * lineHeight - k * lineHeight
        drawLyricLine(plainLines[i] || '', y)
      }
      const nextIdx = (lineIndex + 1) % totalLines
      const incomingY = bottomCenterY - (1 - scrollOffset) * lineHeight
      drawLyricLine(plainLines[nextIdx] || '', incomingY)
    }

    ctx.restore()
  }

  ctx.restore() // end card scale/alpha transform
  } // end if (cardStyleId !== 'none')

  // Lyrics on screen overlay (or when "On card" but card style is None — card UI is skipped otherwise)
  if (showLyricsOverlay) {
    const lyricFontSize = Math.round(Math.min(width, height) * 0.045)
    const lineHeight = lyricFontSize * 1.4
    const boxPad = width * 0.06
    const boxW = width - boxPad * 2
    const boxH = Math.min(height * 0.35, lineHeight * 5)
    const boxX = boxPad
    const boxY = height - boxH - height * 0.12
    const cx = boxX + boxW / 2
    const cy = boxY + boxH / 2
    // For ASS: use full video area so positioning matches .ass file
    const assBoxX = 0
    const assBoxY = 0
    const assBoxW = width
    const assBoxH = height

    ctx.save()
    if (hasSynced) {
      const idx = getCurrentLineIndex(parsed.lines, timeMs)
      const lyricLine = idx >= 0 ? parsed.lines[idx] : null
      if (lyricLine?.text) {
        const resolvedStyle = mergeLyricStyleOverrides(lyricLine.assStyle ?? null, lyricStyleOverrides)
        let drawX = cx
        let drawY = cy
        if (resolvedStyle) {
          const pos = applyAssStyle(ctx, resolvedStyle, assBoxX, assBoxY, assBoxW, assBoxH, height, scriptRes)
          drawX = pos.x
          drawY = pos.y
          const effects: LyricEffects = {
            lineTimeMs: lyricLine.timeMs,
            endTimeMs: lyricLine.endTimeMs,
            currentTimeMs: timeMs,
            scale: pos.scale,
            scriptRes: scriptRes ?? { x: 1920, y: 1080 },
            canvasWidth: width,
            canvasHeight: height,
            zoomEffect: lyricLine.zoomEffect,
            fadeEffect: lyricLine.fadeEffect,
            moveEffect: lyricLine.moveEffect,
            karaokeSegments: lyricLine.karaokeSegments,
          }
          drawLyricWithStyle(ctx, lyricLine.text, drawX, drawY, resolvedStyle, theme.lyricTextColor, pos.scale, effects)
        } else {
          ctx.font = `${theme.bodyStyle} 600 ${lyricFontSize}px ${theme.lyricFont}`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillStyle = lyricLine.color ?? theme.lyricTextColor
          ctx.fillText(lyricLine.text, drawX, drawY)
        }
      }
    } else {
      ctx.font = `${theme.bodyStyle} 600 ${lyricFontSize}px ${theme.lyricFont}`
      ctx.fillStyle = theme.lyricTextColor
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const plainLines = parsed.type === 'plain' ? parsed.lines : []
      const totalLines = plainLines.length
      const lineDurationMs = Math.max(1, Math.floor(durationMs / Math.max(1, totalLines)))
      const lineIndex = Math.floor(timeMs / lineDurationMs)
      const scrollOffset = totalLines > 0 ? (timeMs % lineDurationMs) / lineDurationMs : 0
      const bottomY = boxY + boxH
      const bottomCenterY = bottomY - lineHeight / 2
      const drawLyricLine = (line: string, y: number) => {
        if (y < boxY - lineHeight || y > bottomY + lineHeight) return
        ctx.fillText(line, cx, y)
      }
      for (let k = 0; k <= 6; k++) {
        const idx = (lineIndex - k + totalLines * 10) % totalLines
        const y = bottomCenterY - scrollOffset * lineHeight - k * lineHeight
        drawLyricLine(plainLines[idx] || '', y)
      }
      const incomingIdx = (lineIndex + 1) % totalLines
      const incomingY = bottomCenterY - (1 - scrollOffset) * lineHeight
      drawLyricLine(plainLines[incomingIdx] || '', incomingY)
    }
    ctx.restore()
  }
}

type InstrumentalOpts = Parameters<typeof drawFrame>[1]

function drawInstrumentalFrame(ctx: CanvasRenderingContext2D, opts: InstrumentalOpts) {
  const { width: w, height: h, timeMs, style, image, frontVideo, title, artist, spectrumBars, audioLevel, visualizer, backgroundEffect, particleEffect, backgroundVideo, slideshowImages, slideshowCurrentIndex = 0, videoAnimation = 'kenBurns', animeFrames } = opts
  const hasAnimeFrames = animeFrames?.images?.length
  const hasFrontVideo = (frontVideo && frontVideo.readyState >= 1 && frontVideo.videoWidth > 0 && frontVideo.videoHeight > 0) || !!hasAnimeFrames
  const hasSlideshow = slideshowImages && slideshowImages.length > 0
  const slideshowImage = hasSlideshow ? slideshowImages[slideshowCurrentIndex % slideshowImages.length] : null
  const hasImage = image && image.complete && image.naturalWidth > 0
  const mainVisual = hasSlideshow ? 'slideshow' : hasImage ? 'image' : hasFrontVideo ? 'video' : null
  type InstrumentalVideoSource =
    | { type: 'video'; el: HTMLVideoElement; w: number; h: number }
    | { type: 'anime'; img: HTMLImageElement; w: number; h: number }
    | { type: 'animeBlend'; img1: HTMLImageElement; img2: HTMLImageElement; alpha: number; w: number; h: number }
  const instrumentalVideoFrame = (): InstrumentalVideoSource | null => {
    if (hasAnimeFrames && animeFrames && animeFrames.images.length > 0) {
      const t = timeMs / animeFrames.intervalMs
      const idx0 = Math.min(Math.floor(t), animeFrames.images.length - 1)
      const idx1 = Math.min(idx0 + 1, animeFrames.images.length - 1)
      const alpha = t % 1
      const img1 = animeFrames.images[idx0]
      const img2 = animeFrames.images[idx1]
      if (img1?.complete && img1.naturalWidth > 0) {
        if (idx1 !== idx0 && img2?.complete && img2.naturalWidth > 0 && alpha > 0.001) {
          return { type: 'animeBlend', img1, img2, alpha, w: img1.naturalWidth, h: img1.naturalHeight }
        }
        return { type: 'anime', img: img1, w: img1.naturalWidth, h: img1.naturalHeight }
      }
    }
    if (frontVideo && frontVideo.videoWidth > 0 && frontVideo.videoHeight > 0) return { type: 'video', el: frontVideo, w: frontVideo.videoWidth, h: frontVideo.videoHeight }
    return null
  }
  const instrumentalCardImage = (): HTMLImageElement | null => {
    if (hasAnimeFrames && animeFrames?.images?.length) return animeFrames.images[0]
    return null
  }
  const coverImage = mainVisual === 'slideshow' ? slideshowImage : image
  const theme = getVideoStyleTheme(style)
  const t = timeMs / 1000
  const hasAudio = spectrumBars && spectrumBars.length > 0
  const level = typeof audioLevel === 'number' ? audioLevel : 0.15 + 0.1 * Math.sin(timeMs / 200)
  const idleBars = Array.from({ length: 48 }, (_, i) => 0.2 + 0.28 * Math.sin(timeMs / 140 + i * 0.2))
  const bars = hasAudio ? spectrumBars : idleBars
  const hasBgVideo = backgroundVideo && backgroundVideo.readyState >= 1 && backgroundVideo.videoWidth > 0 && backgroundVideo.videoHeight > 0

  // Background: video or dark gradient
  if (hasBgVideo && backgroundVideo) {
    const vw = backgroundVideo.videoWidth
    const vh = backgroundVideo.videoHeight
    if (vw > 0 && vh > 0) {
      const scale = Math.max(w / vw, h / vh)
      const sx = (vw - w / scale) / 2
      const sy = (vh - h / scale) / 2
      ctx.drawImage(backgroundVideo, sx, sy, w / scale, h / scale, 0, 0, w, h)
    }
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(0, 0, w, h)
  } else {
    const gr = ctx.createLinearGradient(0, 0, w, h)
    gr.addColorStop(0, '#0d0d14')
    gr.addColorStop(0.4, '#12121a')
    gr.addColorStop(0.7, '#0f0f18')
    gr.addColorStop(1, '#08080c')
    ctx.fillStyle = gr
    ctx.fillRect(0, 0, w, h)
  }

  // Subtle background effect
  if (backgroundEffect && backgroundEffect !== 'none') {
    ctx.save()
    ctx.globalAlpha = 0.35
    drawBackgroundEffect(ctx, backgroundEffect, w, h, timeMs)
    ctx.restore()
  }
  // 3D particles
  if (particleEffect && particleEffect !== 'none') {
    drawParticleEffect(ctx, particleEffect, w, h, timeMs)
  }

  // Cover animation: respect videoAnimation (use none when selected)
  const coverSize = Math.min(w, h) * 0.58
  const coverAnim = getVideoAnimationTransform(timeMs, videoAnimation, 20000)
  const zoom = coverAnim.scale
  const panX = coverAnim.panX * coverSize
  const panY = coverAnim.panY * coverSize
  const cx = w / 2
  const cy = h / 2 - h * 0.02
  const coverX = cx - coverSize / 2
  const coverY = cy - coverSize / 2

  ctx.save()
  roundRect(ctx, coverX, coverY, coverSize, coverSize, 24)
  ctx.clip()

  if ((mainVisual === 'image' && image) || (mainVisual === 'slideshow' && coverImage && coverImage.complete && coverImage.naturalWidth > 0)) {
    const img = coverImage!
    const imgW = img.naturalWidth
    const imgH = img.naturalHeight
    const scale = (coverSize * zoom) / Math.min(imgW, imgH)
    const sW = imgW * scale
    const sH = imgH * scale
    const sx = cx + panX - sW / 2
    const sy = cy + panY - sH / 2
    ctx.drawImage(img, 0, 0, imgW, imgH, sx, sy, sW, sH)
  } else if (mainVisual === 'video') {
    const cardImg = instrumentalCardImage()
    if (cardImg && cardImg.complete && cardImg.naturalWidth > 0) {
      const imgW = cardImg.naturalWidth
      const imgH = cardImg.naturalHeight
      const scale = (coverSize * zoom) / Math.min(imgW, imgH)
      const sW = imgW * scale
      const sH = imgH * scale
      const sx = cx + panX - sW / 2
      const sy = cy + panY - sH / 2
      ctx.drawImage(cardImg, 0, 0, imgW, imgH, sx, sy, sW, sH)
    } else {
      const src = instrumentalVideoFrame()
      if (src) {
        const vw = src.w
        const vh = src.h
        const anim = getVideoAnimationTransform(timeMs, videoAnimation, 10000)
        const scale = (coverSize * anim.scale) / Math.min(vw, vh)
        const sW = vw * scale
        const sH = vh * scale
        const sx = cx - sW / 2 - anim.panX * sW
        const sy = cy - sH / 2 - anim.panY * sH
        if (src.type === 'video') ctx.drawImage(src.el, 0, 0, vw, vh, sx, sy, sW, sH)
        else if (src.type === 'animeBlend') {
          ctx.drawImage(src.img1, 0, 0, vw, vh, sx, sy, sW, sH)
          ctx.globalAlpha = src.alpha
          ctx.drawImage(src.img2, 0, 0, vw, vh, sx, sy, sW, sH)
          ctx.globalAlpha = 1
        } else ctx.drawImage(src.img, 0, 0, vw, vh, sx, sy, sW, sH)
      }
    }
  } else {
    const fallback = ctx.createLinearGradient(coverX, coverY, coverX + coverSize, coverY + coverSize)
    fallback.addColorStop(0, '#1a1a2e')
    fallback.addColorStop(1, '#16213e')
    ctx.fillStyle = fallback
    ctx.fillRect(coverX, coverY, coverSize, coverSize)
  }
  ctx.restore()

  // Cover border glow
  ctx.save()
  ctx.strokeStyle = `rgba(255,255,255,${0.12 + 0.06 * Math.sin(t * 1.5)})`
  ctx.lineWidth = 2
  roundRect(ctx, coverX, coverY, coverSize, coverSize, 24)
  ctx.stroke()
  ctx.restore()

  // Vignette
  const vig = ctx.createRadialGradient(cx, cy, coverSize * 0.3, cx, cy, w * 0.9)
  vig.addColorStop(0, 'rgba(0,0,0,0)')
  vig.addColorStop(0.6, 'rgba(0,0,0,0.15)')
  vig.addColorStop(1, 'rgba(0,0,0,0.5)')
  ctx.fillStyle = vig
  ctx.fillRect(0, 0, w, h)

  // Floating orbs (react to level)
  const orbCount = 6
  for (let i = 0; i < orbCount; i++) {
    const angle = (t * 0.2 + (i / orbCount) * Math.PI * 2) % (Math.PI * 2)
    const radius = w * (0.25 + 0.2 * Math.sin(t * 0.3 + i))
    const ox = cx + Math.cos(angle) * radius
    const oy = cy + Math.sin(angle) * radius * 0.6
    const pulse = 0.15 + 0.2 * level + 0.08 * Math.sin(t * 2 + i)
    const r = 4 + 18 * pulse
    ctx.save()
    ctx.globalAlpha = 0.2 + 0.25 * level
    ctx.beginPath()
    ctx.arc(ox, oy, r, 0, Math.PI * 2)
    const [cr, cg, cb] = theme.artGlowColor.split(',').map(Number)
    ctx.fillStyle = `rgba(${cr},${cg},${cb},0.6)`
    ctx.filter = `blur(${8 + pulse * 4}px)`
    ctx.fill()
    ctx.restore()
  }

  // Full-width visualizer at bottom
  const vizH = h * 0.14
  const vizY = h - vizH - h * 0.04
  const vizX = w * 0.04
  const vizW = w - vizX * 2
  ctx.save()
  roundRect(ctx, vizX, vizY, vizW, vizH, 16)
  ctx.fillStyle = 'rgba(0,0,0,0.4)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 1
  ctx.stroke()
  roundRect(ctx, vizX, vizY, vizW, vizH, 16)
  ctx.clip()
  drawVisualizer(ctx, visualizer ?? 'bars', { x: vizX, y: vizY, w: vizW, h: vizH }, bars, level, theme, timeMs, { boostVisibility: true })
  ctx.restore()

  // Minimal title & artist (lower third)
  const textPad = w * 0.06
  const textY = h - vizH - h * 0.12
  const titleSize = Math.round(Math.min(w, h) * 0.042)
  const artistSize = Math.round(Math.min(w, h) * 0.028)
  ctx.font = `${theme.bodyStyle ?? 'normal'} ${theme.bodyWeight ?? '600'} ${titleSize}px ${theme.titleFont ?? 'Outfit, system-ui, sans-serif'}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = `rgba(255,255,255,${0.92 + 0.08 * Math.sin(t * 0.5)})`
  if (title.trim()) ctx.fillText(title, textPad, textY)
  ctx.font = `${theme.bodyStyle ?? 'normal'} 500 ${artistSize}px ${theme.artistFont ?? 'Outfit, system-ui, sans-serif'}`
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  if (artist.trim()) ctx.fillText(artist, textPad, textY + titleSize * 1.1)
}

function easeOutCubic(x: number): number {
  return 1 - Math.pow(1 - x, 3)
}

/** Smoother easing for transitions: slow start, gentle end */
function easeOutQuart(x: number): number {
  return 1 - Math.pow(1 - x, 4)
}

function drawSlideshowLayer(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  currentImg: HTMLImageElement,
  nextImg: HTMLImageElement | null,
  progress: number,
  transition: SlideshowTransitionId,
  imageOpacity: number,
  animationTransform?: { scale: number; panX: number; panY: number }
) {
  const resolvedTransition = transition === 'random' ? 'fade' : transition
  const p = progress
  const animScale = animationTransform?.scale ?? 1
  const animPanX = animationTransform?.panX ?? 0
  const animPanY = animationTransform?.panY ?? 0

  const drawImageCover = (img: HTMLImageElement, opts: { alpha?: number; scale?: number; offsetX?: number; offsetY?: number; panX?: number; panY?: number }) => {
    const alpha = opts.alpha ?? 1
    const scale = (opts.scale ?? 1) * animScale
    const offsetX = opts.offsetX ?? 0
    const offsetY = opts.offsetY ?? 0
    const panX = (opts.panX ?? 0) + animPanX
    const panY = (opts.panY ?? 0) + animPanY
    if (alpha <= 0) return
    ctx.save()
    ctx.globalAlpha *= alpha * imageOpacity
    const iw = img.naturalWidth
    const ih = img.naturalHeight
    const coverScale = Math.max(width / iw, height / ih) * scale
    const sx = (iw - width / coverScale) / 2 + panX * iw
    const sy = (ih - height / coverScale) / 2 + panY * ih
    ctx.translate(width / 2 + offsetX, height / 2 + offsetY)
    ctx.scale(scale, scale)
    ctx.translate(-width / 2, -height / 2)
    ctx.drawImage(img, sx, sy, width / coverScale, height / coverScale, 0, 0, width, height)
    ctx.restore()
  }

  if (resolvedTransition === 'fade') {
    drawImageCover(currentImg, { alpha: 1 - p })
    if (nextImg && p > 0) drawImageCover(nextImg, { alpha: p })
    return
  }

  if (resolvedTransition === 'zoom') {
    const currentScale = 1 + p * 0.08
    const nextScale = 0.94 + p * 0.06
    drawImageCover(currentImg, { scale: currentScale, alpha: 1 - p })
    if (nextImg && p > 0) drawImageCover(nextImg, { scale: nextScale, alpha: p })
    return
  }

  if (resolvedTransition === 'slideLeft') {
    const move = width * 0.12 * p
    drawImageCover(currentImg, { offsetX: -move, alpha: 1 - p })
    if (nextImg && p > 0) drawImageCover(nextImg, { offsetX: width * 0.12 - move, alpha: p })
    return
  }

  if (resolvedTransition === 'slideRight') {
    const move = width * 0.12 * p
    drawImageCover(currentImg, { offsetX: move, alpha: 1 - p })
    if (nextImg && p > 0) drawImageCover(nextImg, { offsetX: -width * 0.12 + move, alpha: p })
    return
  }

  if (resolvedTransition === 'slideUp') {
    const move = height * 0.12 * p
    drawImageCover(currentImg, { offsetY: -move, alpha: 1 - p })
    if (nextImg && p > 0) drawImageCover(nextImg, { offsetY: height * 0.12 - move, alpha: p })
    return
  }

  if (resolvedTransition === 'slideDown') {
    const move = height * 0.12 * p
    drawImageCover(currentImg, { offsetY: move, alpha: 1 - p })
    if (nextImg && p > 0) drawImageCover(nextImg, { offsetY: -height * 0.12 + move, alpha: p })
    return
  }

  if (resolvedTransition === 'zoomPan') {
    const currentZoom = 1 + p * 0.08
    const currentPanX = 0.02 * (1 - p)
    const currentPanY = 0.015 * Math.sin(p * Math.PI)
    const nextZoom = 0.92 + p * 0.08
    const nextPanX = -0.02 * p
    const nextPanY = -0.015 * Math.sin(p * Math.PI)
    drawImageCover(currentImg, { scale: currentZoom, panX: currentPanX, panY: currentPanY, alpha: 1 - p })
    if (nextImg && p > 0) drawImageCover(nextImg, { scale: nextZoom, panX: nextPanX, panY: nextPanY, alpha: p })
    return
  }

  if (resolvedTransition === 'blur') {
    drawImageCover(currentImg, { alpha: 1 - p, scale: 1 + p * 0.02 })
    if (nextImg && p > 0) drawImageCover(nextImg, { alpha: p, scale: 1.02 - p * 0.02 })
    return
  }

  if (resolvedTransition === 'scaleDown') {
    const currentScale = 1 - p * 0.08
    const nextScale = 0.94 + p * 0.06
    drawImageCover(currentImg, { scale: currentScale, alpha: 1 - p })
    if (nextImg && p > 0) drawImageCover(nextImg, { scale: nextScale, alpha: p })
    return
  }

  if (resolvedTransition === 'wipe') {
    drawImageCover(currentImg, { alpha: 1 })
    if (nextImg && p > 0) {
      ctx.save()
      ctx.globalAlpha = p * imageOpacity
      const iw = nextImg.naturalWidth
      const ih = nextImg.naturalHeight
      const coverScale = Math.max(width / iw, height / ih)
      const sx = (iw - width / coverScale) / 2
      const sy = (ih - height / coverScale) / 2
      const clipX = width * (1 - p)
      ctx.beginPath()
      ctx.rect(clipX, 0, width, height)
      ctx.clip()
      ctx.drawImage(nextImg, sx, sy, width / coverScale, height / coverScale, 0, 0, width, height)
      ctx.restore()
    }
    return
  }

  if (resolvedTransition === 'crossZoom') {
    const currentScale = 1 + p * 0.1
    const nextScale = 0.9 + p * 0.1
    drawImageCover(currentImg, { scale: currentScale, alpha: 1 - p })
    if (nextImg && p > 0) drawImageCover(nextImg, { scale: nextScale, alpha: p })
    return
  }

  drawImageCover(currentImg, {})
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const d = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + d, y)
  ctx.lineTo(x + w - d, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + d)
  ctx.lineTo(x + w, y + h - d)
  ctx.quadraticCurveTo(x + w, y + h, x + w - d, y + h)
  ctx.lineTo(x + d, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - d)
  ctx.lineTo(x, y + d)
  ctx.quadraticCurveTo(x, y, x + d, y)
  ctx.closePath()
}

function drawSpeakerIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const s = size * 0.9
  const w = s * 0.35
  const h = s * 0.55
  const rx = w * 0.4
  ctx.beginPath()
  roundRect(ctx, x + (size - w) / 2, y - h / 2, w, h, rx)
  ctx.fill()
  const cx = x + size * 0.52
  ctx.strokeStyle = ctx.fillStyle as string
  ctx.lineCap = 'round'
  ctx.lineWidth = Math.max(2, size * 0.08)
  ctx.beginPath()
  ctx.arc(cx, y, size * 0.2, -0.55 * Math.PI, 0.55 * Math.PI)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx, y, size * 0.32, -0.5 * Math.PI, 0.5 * Math.PI)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx, y, size * 0.44, -0.45 * Math.PI, 0.45 * Math.PI)
  ctx.stroke()
}

function getTitleFontSize(
  ctx: CanvasRenderingContext2D,
  title: string,
  maxWidth: number,
  sizeMax: number,
  sizeMin: number,
  theme: { titleWeight?: string; titleFont?: string }
): number {
  if (!title.trim()) return sizeMax
  const weight = theme?.titleWeight ?? '700'
  const font = theme?.titleFont ?? 'Outfit, system-ui, sans-serif'
  ctx.font = `normal ${weight} ${sizeMax}px ${font}`
  const measuredW = ctx.measureText(title).width
  if (measuredW <= maxWidth) return sizeMax
  const scale = maxWidth / measuredW
  const size = Math.round(sizeMax * scale)
  return Math.max(sizeMin, Math.min(sizeMax, size))
}

function wrapAndDraw(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  const words = text.trim().split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const test = line ? line + ' ' + w : w
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = w
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  lines.forEach((l, i) => {
    ctx.fillText(l, x, y + i * lineHeight)
  })
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    // Blob/data URLs are same-origin; forcing crossOrigin can break decode or canvas readback in some browsers.
    if (!src.startsWith('blob:') && !src.startsWith('data:')) {
      img.crossOrigin = 'anonymous'
    }
    img.onload = () => {
      const done = () => resolve(img)
      if (typeof img.decode === 'function') {
        img.decode().then(done).catch(done)
      } else {
        done()
      }
    }
    img.onerror = reject
    img.src = src
  })
}
