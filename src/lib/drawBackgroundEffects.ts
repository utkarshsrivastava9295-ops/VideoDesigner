/**
 * Animated background effects (fire, snow, fog, etc.) – realistic graphics, low opacity overlay.
 * Sparkles can use preloaded images from public/effects/sparkles/ for a natural bokeh look.
 */

import type { BackgroundEffectId } from './videoBackgroundEffects'
import { getSparkleImages } from './effectImageLoader'

const BASE_OPACITY = 0.5

function hash(i: number, t: number): number {
  const x = Math.sin(i * 12.9898 + t * 0.001) * 43758.5453
  return x - Math.floor(x)
}

function hash2(i: number, j: number, t: number): number {
  return hash(i + j * 97, t)
}

/** Draw a single rose-petal shape (rounded tip, slightly pointed base) centered at 0,0. */
function drawPetalPath(ctx: CanvasRenderingContext2D, size: number): void {
  const w = size * 1.2
  const h = size * 0.9
  ctx.beginPath()
  ctx.moveTo(0, -h)
  ctx.bezierCurveTo(w * 0.9, -h * 0.3, w * 0.7, h * 0.6, 0, h * 0.85)
  ctx.bezierCurveTo(-w * 0.7, h * 0.6, -w * 0.9, -h * 0.3, 0, -h)
  ctx.fill()
}

export function drawBackgroundEffect(
  ctx: CanvasRenderingContext2D,
  id: BackgroundEffectId,
  width: number,
  height: number,
  timeMs: number
): void {
  if (id === 'none') return
  const t = timeMs * 0.001
  ctx.save()
  ctx.globalAlpha = BASE_OPACITY

  switch (id) {
    case 'fire': {
      // Heat haze base
      const haze = ctx.createRadialGradient(width * 0.5, height * 1.1, 0, width * 0.5, height * 1.1, height * 1.2)
      haze.addColorStop(0, 'rgba(80,25,5,0.35)')
      haze.addColorStop(0.4, 'rgba(120,40,0,0.2)')
      haze.addColorStop(0.7, 'rgba(60,20,0,0.08)')
      haze.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = haze
      ctx.fillRect(0, 0, width, height)
      // Layered flame gradients (bottom-up)
      for (let L = 0; L < 5; L++) {
        const wave = Math.sin(t * 2 + L * 0.8) * 0.02 * width
        const gr = ctx.createLinearGradient(width * 0.5 + wave, height * 1.05, width * 0.5 - wave, 0)
        gr.addColorStop(0, 'rgba(0,0,0,0)')
        gr.addColorStop(0.15, 'rgba(40,15,0,0.25)')
        gr.addColorStop(0.35, `rgba(180,60,10,${0.35 - L * 0.05})`)
        gr.addColorStop(0.55, `rgba(255,140,40,${0.28 - L * 0.04})`)
        gr.addColorStop(0.75, `rgba(255,200,100,${0.15 - L * 0.02})`)
        gr.addColorStop(1, 'rgba(255,220,180,0)')
        ctx.fillStyle = gr
        ctx.fillRect(0, 0, width, height)
      }
      // Individual flame wisps (organic, rising)
      for (let i = 0; i < 40; i++) {
        const baseX = (hash(i, Math.floor(t * 2)) * 0.85 + 0.075) * width
        const rise = (timeMs / 60 + i * 90) % (height + 120)
        const y = height - rise
        const sway = Math.sin(t * 3 + i * 0.7) * 25 + Math.sin(t * 1.5 + i * 0.3) * 15
        const x = baseX + sway
        const w = 45 + hash(i + 10, timeMs) * 70
        const h = 70 + hash(i + 20, timeMs) * 90
        const gr = ctx.createRadialGradient(x, y + h * 0.6, 0, x, y + h * 0.6, Math.max(w, h))
        gr.addColorStop(0, `rgba(255,180,80,${0.5 - rise / height * 0.35})`)
        gr.addColorStop(0.35, `rgba(255,100,30,${0.25 - rise / height * 0.2})`)
        gr.addColorStop(0.65, 'rgba(180,50,0,0.08)')
        gr.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = gr
        ctx.beginPath()
        ctx.ellipse(x, y + h * 0.3, w * 0.5, h * 0.5, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      // Embers
      for (let i = 0; i < 20; i++) {
        const ex = (hash(i + 30, Math.floor(timeMs / 80)) * 1.1 - 0.05) * width
        const ey = height - ((timeMs / 45 + i * 70) % (height + 60))
        const pulse = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(timeMs / 120 + i))
        ctx.fillStyle = `rgba(255,220,150,${pulse})`
        ctx.beginPath()
        ctx.arc(ex, ey, 1.5 + hash(i, timeMs), 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }

    case 'snow': {
      for (let i = 0; i < 100; i++) {
        const h = hash2(i, 0, Math.floor(timeMs / 80))
        const x = (h * 1.15 - 0.075) * width + Math.sin(t + i * 0.5) * 8
        const y = ((timeMs / 40 + i * 170) % (height + 80)) - 40
        const r = 1.5 + hash2(i, 1, timeMs) * 4
        const alpha = 0.5 + 0.5 * (0.4 + 0.6 * hash2(i, 2, timeMs))
        ctx.fillStyle = `rgba(255,255,255,${alpha})`
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = `rgba(255,255,255,${alpha * 0.4})`
        ctx.beginPath()
        ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.6, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }

    case 'fog': {
      for (let layer = 0; layer < 5; layer++) {
        const speed = 0.015 + layer * 0.008
        const offset = (timeMs * speed * 0.5 + layer * 400) % (width * 2.5) - width * 0.5
        const gr = ctx.createLinearGradient(offset, height * 0.5, offset + width * 1.8, height * 0.5)
        gr.addColorStop(0, 'rgba(255,255,255,0)')
        gr.addColorStop(0.15, 'rgba(248,252,255,0.06)')
        gr.addColorStop(0.35, 'rgba(255,255,255,0.14)')
        gr.addColorStop(0.5, 'rgba(250,252,255,0.2)')
        gr.addColorStop(0.65, 'rgba(255,255,255,0.14)')
        gr.addColorStop(0.85, 'rgba(248,252,255,0.06)')
        gr.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = gr
        ctx.fillRect(0, 0, width, height)
      }
      for (let i = 0; i < 12; i++) {
        const ox = (hash(i, Math.floor(timeMs / 300)) * 1.2 - 0.1) * width
        const oy = height * (0.3 + hash(i + 1, timeMs) * 0.5)
        const rad = 180 + hash(i + 2, timeMs) * 220
        const gr = ctx.createRadialGradient(ox, oy, 0, ox, oy, rad)
        gr.addColorStop(0, 'rgba(255,255,255,0.2)')
        gr.addColorStop(0.4, 'rgba(252,253,255,0.08)')
        gr.addColorStop(0.7, 'rgba(250,252,255,0.02)')
        gr.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = gr
        ctx.beginPath()
        ctx.arc(ox, oy, rad, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }

    case 'smoke': {
      for (let i = 0; i < 25; i++) {
        const baseX = (hash(i, Math.floor(timeMs / 250)) * 1.25 - 0.125) * width
        const rise = (timeMs / 100 + i * 100) % (height + 200)
        const y = height - rise
        const drift = Math.sin(t * 0.8 + i * 0.4) * 40 + (rise / height) * 60
        const x = baseX + drift
        const r = 100 + hash(i + 5, timeMs) * 180
        const alpha = (0.35 - rise / height * 0.25) * (0.7 + 0.3 * Math.sin(t + i * 0.5))
        const gr = ctx.createRadialGradient(x, y, 0, x, y, r)
        gr.addColorStop(0, `rgba(220,222,228,${alpha})`)
        gr.addColorStop(0.4, `rgba(200,202,210,${alpha * 0.6})`)
        gr.addColorStop(0.7, 'rgba(180,182,190,0.04)')
        gr.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = gr
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }

    case 'rain': {
      const angle = -0.12
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      for (let i = 0; i < 120; i++) {
        const h = hash2(i, 0, Math.floor(timeMs / 25))
        const x = (h * 1.2 - 0.1) * width
        const y = ((timeMs / 18 + i * 25) % (height + 100)) - 50
        const len = 20 + hash2(i, 1, timeMs) * 35
        const ex = x + len * cos
        const ey = y + len * sin
        const alpha = 0.35 + 0.35 * hash2(i, 2, timeMs)
        const grad = ctx.createLinearGradient(x, y, ex, ey)
        grad.addColorStop(0, 'rgba(255,255,255,0)')
        grad.addColorStop(0.2, `rgba(255,255,255,${alpha * 0.6})`)
        grad.addColorStop(0.5, `rgba(255,255,255,${alpha})`)
        grad.addColorStop(0.8, `rgba(255,255,255,${alpha * 0.6})`)
        grad.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.strokeStyle = grad
        ctx.lineWidth = 1.2
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(ex, ey)
        ctx.stroke()
      }
      ctx.lineCap = 'butt'
      break
    }

    case 'leaves': {
      const colors = [
        'rgba(160,100,50,0.75)',
        'rgba(140,85,45,0.7)',
        'rgba(180,115,55,0.72)',
        'rgba(150,90,48,0.68)',
        'rgba(190,125,65,0.7)',
      ]
      for (let i = 0; i < 35; i++) {
        const x = (hash(i, Math.floor(timeMs / 250)) * 1.2 - 0.1) * width
        const y = ((timeMs / 70 + i * 100) % (height + 120)) - 60
        const size = 6 + hash(i + 2, timeMs) * 14
        const rot = (timeMs / 180 + i * 0.8) * 0.6
        const wobble = Math.sin(timeMs / 400 + i) * 0.15
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(rot + wobble)
        ctx.fillStyle = colors[i % colors.length]
        ctx.beginPath()
        ctx.ellipse(0, 0, size * 1.1, size * 1.5, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 0.25
        ctx.fillStyle = 'rgba(0,0,0,0.2)'
        ctx.beginPath()
        ctx.ellipse(size * 0.2, size * 0.2, size * 0.5, size * 0.7, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
      break
    }

    case 'sparkles': {
      const images = getSparkleImages()
      const useImages = images.length > 0
      const count = useImages ? 55 : 70
      for (let i = 0; i < count; i++) {
        const x = (hash(i, Math.floor(timeMs / 200)) * 1.05 + 0.02) * width
        const y = (hash(i + 70, Math.floor(timeMs / 200)) * 1.05 + 0.02) * height
        const pulse = 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(timeMs / 400 + i * 0.5))
        if (useImages) {
          const img = images[i % images.length]
          if (img.complete && img.naturalWidth > 0) {
            const size = (20 + hash(i + 1, timeMs) * 50) * (0.7 + 0.5 * pulse)
            const half = size / 2
            ctx.save()
            ctx.globalAlpha *= pulse * 0.85
            ctx.drawImage(img, x - half, y - half, size, size)
            ctx.restore()
          }
        } else {
          const r = 2 + pulse * 4
          const gr = ctx.createRadialGradient(x, y, 0, x, y, r * 2.5)
          gr.addColorStop(0, `rgba(255,255,255,${0.6 * pulse})`)
          gr.addColorStop(0.5, `rgba(255,255,245,${0.25 * pulse})`)
          gr.addColorStop(1, 'rgba(255,255,255,0)')
          ctx.fillStyle = gr
          ctx.beginPath()
          ctx.arc(x, y, r * 2.5, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      break
    }

    case 'aurora': {
      for (let band = 0; band < 4; band++) {
        const phase = band * 0.4 + t * 0.15
        const yBase = height * (0.15 + band * 0.2 + Math.sin(phase) * 0.08)
        const gr = ctx.createLinearGradient(0, yBase - height * 0.15, width, yBase + height * 0.15)
        gr.addColorStop(0, 'rgba(0,80,60,0)')
        gr.addColorStop(0.2, `rgba(0,220,180,${0.06 + Math.sin(phase * 2) * 0.03})`)
        gr.addColorStop(0.4, `rgba(80,255,220,${0.12 + Math.sin(phase) * 0.04})`)
        gr.addColorStop(0.5, `rgba(0,255,200,${0.14 + Math.sin(phase * 1.5) * 0.04})`)
        gr.addColorStop(0.6, `rgba(100,255,230,${0.1 + Math.sin(phase * 0.8) * 0.03})`)
        gr.addColorStop(0.8, `rgba(0,200,220,${0.05})`)
        gr.addColorStop(1, 'rgba(0,100,120,0)')
        ctx.fillStyle = gr
        ctx.fillRect(0, 0, width, height)
      }
      const waveGr = ctx.createLinearGradient(0, 0, width * 0.5, height)
      waveGr.addColorStop(0, 'rgba(0,255,220,0)')
      waveGr.addColorStop(0.3, `rgba(0,255,200,${0.08 + 0.05 * Math.sin(t * 0.5)})`)
      waveGr.addColorStop(0.6, `rgba(80,255,240,${0.1 + 0.06 * Math.sin(t * 0.7)})`)
      waveGr.addColorStop(1, 'rgba(0,255,200,0)')
      ctx.fillStyle = waveGr
      ctx.fillRect(0, height * 0.1, width, height * 0.5)
      break
    }

    case 'bubbles': {
      for (let i = 0; i < 40; i++) {
        const x = (hash(i, Math.floor(timeMs / 200)) * 1.2 - 0.1) * width
        const y = height - ((timeMs / 90 + i * 55) % (height + 100))
        const r = 12 + hash(i + 3, timeMs) * 40
        const wobble = Math.sin(timeMs / 200 + i * 0.5) * 3
        const alpha = 0.18 + hash(i, timeMs) * 0.22
        ctx.strokeStyle = `rgba(255,255,255,${alpha})`
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.arc(x + wobble, y, r, 0, Math.PI * 2)
        ctx.stroke()
        const hlX = x - r * 0.35 + wobble
        const hlY = y - r * 0.3
        const hlGr = ctx.createRadialGradient(hlX, hlY, 0, hlX, hlY, r * 0.4)
        hlGr.addColorStop(0, 'rgba(255,255,255,0.5)')
        hlGr.addColorStop(0.5, 'rgba(255,255,255,0.15)')
        hlGr.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = hlGr
        ctx.beginPath()
        ctx.arc(hlX, hlY, r * 0.35, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }

    case 'dust': {
      for (let i = 0; i < 100; i++) {
        const x = (hash(i, Math.floor(timeMs / 350)) * 1.08 - 0.04) * width
        const y = (hash(i + 100, Math.floor(timeMs / 350) + 0.5) * 1.08 - 0.04) * height
        const size = 1.2 + hash(i + 200, timeMs) * 2.2
        const a = (0.15 + 0.4 * (0.5 + 0.5 * Math.sin(timeMs / 280 + i * 0.2))) * (0.6 + 0.4 * hash(i, timeMs))
        ctx.fillStyle = `rgba(255,252,245,${a})`
        ctx.beginPath()
        ctx.arc(x, y, size, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }

    case 'rosePetals': {
      const roseColors = [
        'rgba(220,105,130,0.82)',
        'rgba(200,75,110,0.78)',
        'rgba(255,160,185,0.8)',
        'rgba(185,65,95,0.76)',
        'rgba(235,120,150,0.8)',
        'rgba(210,85,115,0.78)',
      ]
      for (let i = 0; i < 45; i++) {
        const baseX = (hash(i, Math.floor(timeMs / 200)) * 1.15 - 0.075) * width
        const fall = (timeMs / 55 + i * 85) % (height + 150)
        const y = height - fall
        const sway = Math.sin(timeMs / 400 + i * 0.6) * 35 + Math.sin(timeMs / 180 + i * 0.3) * 18
        const x = baseX + sway
        const size = 8 + hash(i + 10, timeMs) * 18
        const rot = (timeMs / 220 + i * 0.9) * 0.5
        const wobble = Math.sin(timeMs / 350 + i * 0.4) * 0.12
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(rot + wobble)
        ctx.fillStyle = roseColors[i % roseColors.length]
        drawPetalPath(ctx, size)
        ctx.restore()
      }
      break
    }

    default:
      break
  }

  ctx.restore()
}
