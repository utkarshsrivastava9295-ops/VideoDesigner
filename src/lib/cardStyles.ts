/**
 * Ten selectable card/box styles with distinct entrance animations and shapes.
 */

export type CardStyleId =
  | 'slide'
  | 'fadeUp'
  | 'scale'
  | 'pill'
  | 'glass'
  | 'bounce'
  | 'flip'
  | 'float'
  | 'minimal'
  | 'neon'
  | 'split'
  | 'cornerExpand'
  | 'gradientBorder'
  | 'diagonal'
  | 'spotlight'
  | 'ribbon'
  | 'none'

export interface CardStyleOption {
  id: CardStyleId
  name: string
  description: string
}

export const CARD_STYLES: CardStyleOption[] = [
  { id: 'slide', name: 'Slide In', description: 'Card slides in from the right' },
  { id: 'fadeUp', name: 'Fade Up', description: 'Card fades in and rises from below' },
  { id: 'scale', name: 'Scale Pop', description: 'Card scales up from the center' },
  { id: 'pill', name: 'Pill Bar', description: 'Compact pill-shaped bar slides up' },
  { id: 'glass', name: 'Glass', description: 'Frosted glass panel fades in' },
  { id: 'bounce', name: 'Bounce', description: 'Card bounces up from the bottom' },
  { id: 'flip', name: 'Flip', description: 'Card flips in from the side' },
  { id: 'float', name: 'Float', description: 'Card fades in and floats gently' },
  { id: 'minimal', name: 'Minimal', description: 'Thin line expands into the card' },
  { id: 'neon', name: 'Neon', description: 'Neon glow border fades in' },
  { id: 'split', name: 'Split', description: 'Card splits apart and joins in' },
  { id: 'cornerExpand', name: 'Corner', description: 'Expands from bottom-left corner' },
  { id: 'gradientBorder', name: 'Gradient Border', description: 'Animated gradient outline reveal' },
  { id: 'diagonal', name: 'Diagonal', description: 'Sweeps in diagonally from corner' },
  { id: 'spotlight', name: 'Spotlight', description: 'Reveals like a spotlight sweep' },
  { id: 'ribbon', name: 'Ribbon', description: 'Ribbon curls up from below' },
  { id: 'none', name: 'None', description: 'No card – video and effects only' },
]

/** Duration (ms) of the standard card entrance animation. Also reused when mirroring the exit. */
export const CARD_ENTRANCE_MS = 1000

function easeOutCubic(x: number): number {
  return 1 - Math.pow(1 - x, 3)
}

export interface CardAnimationState {
  drawX: number
  drawY: number
  cardW: number
  cardH: number
  scale: number
  alpha: number
  radius: number
  /** If true, renderer uses glass-style fill (frosted) */
  useGlass: boolean
  /** If true, renderer draws strong neon glow border */
  useNeon: boolean
}

export function getCardAnimation(
  styleId: CardStyleId,
  timeMs: number,
  width: number,
  height: number,
  margin: number
): CardAnimationState {
  const cardW = width - margin * 2
  const cardX = margin
  const cardMarginBottom = height * 0.04
  const baseCardH = height * 0.3
  const pillCardH = height * 0.22
  const cardYBase = height - baseCardH - cardMarginBottom
  const pillCardY = height - pillCardH - cardMarginBottom
  const e = easeOutCubic(Math.min(1, timeMs / CARD_ENTRANCE_MS))

  switch (styleId) {
    case 'slide': {
      const slideOffset = (1 - e) * (cardW + 50)
      return {
        drawX: cardX + slideOffset,
        drawY: cardYBase,
        cardW,
        cardH: baseCardH,
        scale: 1,
        alpha: 1,
        radius: 20,
        useGlass: false,
        useNeon: false,
      }
    }
    case 'fadeUp': {
      const startY = height + 40
      const drawY = startY + (cardYBase - startY) * e
      return {
        drawX: cardX,
        drawY,
        cardW,
        cardH: baseCardH,
        scale: 1,
        alpha: e,
        radius: 20,
        useGlass: false,
        useNeon: false,
      }
    }
    case 'scale': {
      const scale = 0.25 + 0.75 * e
      return {
        drawX: cardX,
        drawY: cardYBase,
        cardW,
        cardH: baseCardH,
        scale,
        alpha: 1,
        radius: 20,
        useGlass: false,
        useNeon: false,
      }
    }
    case 'pill': {
      const startY = height + 30
      const drawY = startY + (pillCardY - startY) * e
      return {
        drawX: cardX,
        drawY,
        cardW,
        cardH: pillCardH,
        scale: 1,
        alpha: 1,
        radius: pillCardH / 2,
        useGlass: false,
        useNeon: false,
      }
    }
    case 'glass': {
      return {
        drawX: cardX,
        drawY: cardYBase,
        cardW,
        cardH: baseCardH,
        scale: 1,
        alpha: e,
        radius: 28,
        useGlass: true,
        useNeon: false,
      }
    }
    case 'bounce': {
      const startY = height + 60
      const e = Math.min(1, timeMs / 700)
      const bounceEase = e < 1 ? easeOutCubic(e) : 1
      const overshoot = timeMs > 500 && timeMs < 850 ? 8 * Math.exp(-Math.pow((timeMs - 650) / 120, 2)) : 0
      const drawY = startY + (cardYBase - startY) * bounceEase - overshoot
      return {
        drawX: cardX,
        drawY: drawY,
        cardW,
        cardH: baseCardH,
        scale: 1,
        alpha: Math.min(1, e * 1.2),
        radius: 20,
        useGlass: false,
        useNeon: false,
      }
    }
    case 'flip': {
      const flipEase = easeOutCubic(Math.min(1, timeMs / 900))
      const scaleX = 0.05 + 0.95 * flipEase
      return {
        drawX: cardX,
        drawY: cardYBase,
        cardW,
        cardH: baseCardH,
        scale: scaleX,
        alpha: e,
        radius: 20,
        useGlass: false,
        useNeon: false,
      }
    }
    case 'float': {
      const startY = cardYBase + 50
      const drawY = startY + (cardYBase - startY) * e
      const float = Math.sin(timeMs / 1800) * 4
      return {
        drawX: cardX,
        drawY: drawY + float,
        cardW,
        cardH: baseCardH,
        scale: 1,
        alpha: e,
        radius: 22,
        useGlass: false,
        useNeon: false,
      }
    }
    case 'minimal': {
      const lineH = 4
      const expandEase = easeOutCubic(Math.min(1, timeMs / 1100))
      const drawH = lineH + (baseCardH - lineH) * expandEase
      const drawY = height - drawH - cardMarginBottom
      return {
        drawX: cardX,
        drawY: drawY,
        cardW,
        cardH: drawH,
        scale: 1,
        alpha: 1,
        radius: Math.min(20, drawH / 2),
        useGlass: false,
        useNeon: false,
      }
    }
    case 'neon': {
      return {
        drawX: cardX,
        drawY: cardYBase,
        cardW,
        cardH: baseCardH,
        scale: 1,
        alpha: e,
        radius: 24,
        useGlass: false,
        useNeon: true,
      }
    }
    case 'split': {
      const splitEase = easeOutCubic(Math.min(1, timeMs / 950))
      const scaleVal = 0.05 + 0.95 * splitEase
      return {
        drawX: cardX,
        drawY: cardYBase,
        cardW,
        cardH: baseCardH,
        scale: scaleVal,
        alpha: splitEase,
        radius: 20,
        useGlass: false,
        useNeon: false,
      }
    }
    case 'cornerExpand': {
      const cornerEase = easeOutCubic(Math.min(1, timeMs / 1100))
      const startW = cardW * 0.15
      const startH = baseCardH * 0.2
      const drawW = startW + (cardW - startW) * cornerEase
      const drawH = startH + (baseCardH - startH) * cornerEase
      return {
        drawX: margin,
        drawY: height - drawH - cardMarginBottom,
        cardW: drawW,
        cardH: drawH,
        scale: 1,
        alpha: cornerEase,
        radius: Math.min(20, drawH / 2, drawW / 2),
        useGlass: false,
        useNeon: false,
      }
    }
    case 'gradientBorder': {
      const borderEase = easeOutCubic(Math.min(1, timeMs / 1000))
      const shrink = (1 - borderEase) * 12
      return {
        drawX: cardX - shrink,
        drawY: cardYBase - shrink,
        cardW: cardW + shrink * 2,
        cardH: baseCardH + shrink * 2,
        scale: 1,
        alpha: borderEase,
        radius: 28,
        useGlass: false,
        useNeon: true,
      }
    }
    case 'diagonal': {
      const diagEase = easeOutCubic(Math.min(1, timeMs / 900))
      const startX = cardX + cardW + 100
      const startY = height + 80
      const drawX = startX + (cardX - startX) * diagEase
      const drawY = startY + (cardYBase - startY) * diagEase
      return {
        drawX,
        drawY,
        cardW,
        cardH: baseCardH,
        scale: diagEase,
        alpha: diagEase,
        radius: 22,
        useGlass: false,
        useNeon: false,
      }
    }
    case 'spotlight': {
      const spotEase = easeOutCubic(Math.min(1, timeMs / 1000))
      return {
        drawX: cardX,
        drawY: cardYBase,
        cardW,
        cardH: baseCardH,
        scale: 1,
        alpha: Math.min(1, spotEase * 1.2),
        radius: 24,
        useGlass: false,
        useNeon: false,
      }
    }
    case 'ribbon': {
      const ribbonEase = easeOutCubic(Math.min(1, timeMs / 1050))
      const curl = Math.sin(ribbonEase * Math.PI) * 0.15
      const drawH = baseCardH * (0.2 + 0.8 * ribbonEase)
      const drawY = height - drawH - cardMarginBottom
      const sway = Math.sin(timeMs / 400) * 3
      return {
        drawX: cardX + sway,
        drawY: drawY,
        cardW,
        cardH: drawH,
        scale: 1 + curl,
        alpha: ribbonEase,
        radius: Math.min(18, drawH / 2),
        useGlass: false,
        useNeon: false,
      }
    }
    case 'none': {
      return {
        drawX: cardX,
        drawY: cardYBase,
        cardW,
        cardH: baseCardH,
        scale: 1,
        alpha: 0,
        radius: 20,
        useGlass: false,
        useNeon: false,
      }
    }
    default:
      return {
        drawX: cardX,
        drawY: cardYBase,
        cardW,
        cardH: baseCardH,
        scale: 1,
        alpha: 1,
        radius: 20,
        useGlass: false,
        useNeon: false,
      }
  }
}
