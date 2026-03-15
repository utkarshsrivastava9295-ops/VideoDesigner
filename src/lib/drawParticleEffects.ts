/**
 * 3D-style particle effects with depth, perspective, shadows, and polished graphics.
 * Particles use z-depth for perspective projection and layered rendering.
 */

import type { ParticleEffectId } from './videoParticleEffects'

const BASE_OPACITY = 0.65

function hash(i: number, t: number): number {
  const x = Math.sin(i * 12.9898 + t * 0.001) * 43758.5453
  return x - Math.floor(x)
}

/** Project 3D point to screen with perspective. z: 0=near (large), 1=far (small) */
function project(x: number, y: number, z: number, w: number, h: number): { sx: number; sy: number; scale: number } {
  const depthScale = 2.5
  const f = 1 / (1 + z * depthScale)
  const sx = w * 0.5 + (x - 0.5) * w * f
  const sy = h * 0.5 + (y - 0.5) * h * f
  return { sx, sy, scale: f }
}

/** Draw a 3D sphere (circle with radial gradient for highlight) */
function drawSphere(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  highlightColor: string,
  alpha: number
) {
  const grad = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, 0, x, y, radius)
  grad.addColorStop(0, highlightColor)
  grad.addColorStop(0.35, color)
  grad.addColorStop(0.7, color)
  grad.addColorStop(1, `rgba(0,0,0,${0.3 * alpha})`)
  ctx.fillStyle = grad
  ctx.globalAlpha = alpha
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
}

/** Draw shadow beneath a particle */
function drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, alpha: number) {
  ctx.save()
  ctx.globalAlpha = alpha * 0.4
  const grad = ctx.createRadialGradient(x, y + radius * 0.5, 0, x, y + radius * 1.5, radius * 2)
  grad.addColorStop(0, 'rgba(0,0,0,0.5)')
  grad.addColorStop(0.5, 'rgba(0,0,0,0.15)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.ellipse(x, y + radius, radius * 1.2, radius * 0.5, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

export function drawParticleEffect(
  ctx: CanvasRenderingContext2D,
  id: ParticleEffectId,
  width: number,
  height: number,
  timeMs: number
): void {
  if (id === 'none') return
  const t = timeMs * 0.001
  ctx.save()
  ctx.globalAlpha = BASE_OPACITY

  switch (id) {
    case 'spheres': {
      const colors = [
        { c: 'rgba(100,200,255,0.95)', h: 'rgba(180,220,255,1)' },
        { c: 'rgba(255,150,200,0.95)', h: 'rgba(255,200,230,1)' },
        { c: 'rgba(150,255,180,0.95)', h: 'rgba(200,255,220,1)' },
        { c: 'rgba(255,220,100,0.95)', h: 'rgba(255,240,180,1)' },
      ]
      for (let i = 0; i < 50; i++) {
        const z = hash(i, Math.floor(t * 2)) * 0.85
        const x = 0.2 + hash(i + 10, Math.floor(t * 1.2)) * 0.6
        const y = (t * 0.03 + hash(i + 20, Math.floor(t)) * 0.7) % 1.15 - 0.08
        const { sx, sy, scale } = project(x, y, z, width, height)
        const size = (8 + hash(i + 30, t) * 20) * scale
        const col = colors[i % colors.length]
        if (sx >= -50 && sx <= width + 50 && sy >= -50 && sy <= height + 50) {
          drawShadow(ctx, sx, sy, size, 0.8 - z * 0.5)
          drawSphere(ctx, sx, sy, size, col.c, col.h, 0.85 - z * 0.4)
        }
      }
      break
    }

    case 'confetti3d': {
      const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#a29bfe', '#fd79a8', '#fdcb6e']
      for (let i = 0; i < 45; i++) {
        const z = hash(i, Math.floor(t * 2)) * 0.9
        const x = hash(i + 1, Math.floor(t * 1.5)) * 1.05 - 0.02
        const y = ((t * 60 + i * 40) % (height + 80)) / (height + 80)
        const { sx, sy, scale } = project(x, y, z, width, height)
        const size = (5 + hash(i + 2, t) * 12) * scale
        const rot = t * 2 + i * 0.5
        if (sx < -30 || sx > width + 30 || sy < -30 || sy > height + 30) continue
        ctx.save()
        ctx.translate(sx, sy)
        ctx.rotate(rot)
        ctx.globalAlpha = 0.8 - z * 0.5
        ctx.fillStyle = colors[i % colors.length]
        ctx.shadowColor = 'rgba(0,0,0,0.3)'
        ctx.shadowBlur = 4
        ctx.shadowOffsetY = 2
        ctx.fillRect(-size / 2, -size / 4, size, size / 2)
        ctx.restore()
      }
      break
    }

    case 'hearts3d': {
      for (let i = 0; i < 35; i++) {
        const z = hash(i, Math.floor(t * 2)) * 0.85
        const x = 0.15 + hash(i + 1, Math.floor(t * 1.3)) * 0.7
        const y = (t * 0.04 + hash(i + 2, Math.floor(t)) * 0.6) % 1.1 - 0.05
        const { sx, sy, scale } = project(x, y, z, width, height)
        const size = (6 + hash(i + 3, t) * 14) * scale
        const pulse = 0.7 + 0.3 * Math.sin(t * 2 + i * 0.4)
        if (sx < -40 || sx > width + 40 || sy < -40 || sy > height + 40) continue
        ctx.save()
        ctx.translate(sx, sy)
        ctx.scale((size / 12) * pulse, (size / 12) * pulse)
        ctx.globalAlpha = 0.85 - z * 0.5
        ctx.fillStyle = `rgba(255,100,130,${pulse})`
        ctx.shadowColor = 'rgba(255,80,100,0.6)'
        ctx.shadowBlur = 8
        ctx.beginPath()
        ctx.moveTo(0, -0.35)
        ctx.bezierCurveTo(0.5, -0.5, 0.85, 0, 0, 0.45)
        ctx.bezierCurveTo(-0.85, 0, -0.5, -0.5, 0, -0.35)
        ctx.fill()
        ctx.restore()
      }
      break
    }

    case 'stars3d': {
      for (let i = 0; i < 60; i++) {
        const z = hash(i, Math.floor(t * 3)) * 0.9
        const x = hash(i + 1, Math.floor(t * 2)) * 1.05 - 0.02
        const y = hash(i + 2, Math.floor(t * 2) + 0.5) * 1.05 - 0.02
        const { sx, sy, scale } = project(x, y, z, width, height)
        const size = (2 + hash(i + 3, t) * 6) * scale
        const twinkle = 0.5 + 0.5 * Math.sin(t * 3 + i * 0.5)
        if (sx < -20 || sx > width + 20 || sy < -20 || sy > height + 20) continue
        ctx.save()
        ctx.translate(sx, sy)
        ctx.globalAlpha = twinkle * (0.9 - z * 0.5)
        ctx.fillStyle = `rgba(255,255,255,${twinkle})`
        ctx.shadowColor = 'rgba(255,255,255,0.8)'
        ctx.shadowBlur = 6
        ctx.beginPath()
        ctx.moveTo(0, -size)
        ctx.lineTo(size * 0.35, 0)
        ctx.lineTo(0, size)
        ctx.lineTo(-size * 0.35, 0)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }
      break
    }

    case 'sparkle3d': {
      for (let i = 0; i < 70; i++) {
        const z = hash(i, Math.floor(t * 2)) * 0.85
        const x = hash(i + 1, Math.floor(t * 1.5)) * 1.08 - 0.04
        const y = hash(i + 2, Math.floor(t * 1.5) + 0.5) * 1.08 - 0.04
        const { sx, sy, scale } = project(x, y, z, width, height)
        const size = (3 + hash(i + 3, t) * 10) * scale
        const pulse = 0.5 + 0.5 * Math.sin(t * 4 + i * 0.3)
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, size * 3)
        grad.addColorStop(0, `rgba(255,255,255,${pulse * (0.9 - z * 0.5)})`)
        grad.addColorStop(0.4, `rgba(255,255,240,${pulse * 0.4 * (0.9 - z)})`)
        grad.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(sx, sy, size * 2.5, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }

    case 'floatingOrbs': {
      const orbColors = [
        { c: 'rgba(139,92,246,0.9)', h: 'rgba(196,181,253,1)' },
        { c: 'rgba(236,72,153,0.9)', h: 'rgba(251,207,232,1)' },
        { c: 'rgba(34,211,238,0.9)', h: 'rgba(165,243,252,1)' },
      ]
      for (let i = 0; i < 40; i++) {
        const z = hash(i, Math.floor(t * 2)) * 0.8
        const x = 0.2 + hash(i + 1, Math.floor(t * 0.8)) * 0.6
        const y = (t * 0.02 + hash(i + 2, Math.floor(t)) * 0.5) % 1.1 - 0.05
        const { sx, sy, scale } = project(x, y, z, width, height)
        const size = (12 + hash(i + 3, t) * 25) * scale
        const col = orbColors[i % orbColors.length]
        if (sx >= -60 && sx <= width + 60 && sy >= -60 && sy <= height + 60) {
          drawShadow(ctx, sx, sy, size * 0.8, 0.7 - z * 0.4)
          drawSphere(ctx, sx, sy, size, col.c, col.h, 0.75 - z * 0.4)
        }
      }
      break
    }

    case 'auroraDust': {
      for (let i = 0; i < 55; i++) {
        const z = hash(i, Math.floor(t * 2)) * 0.9
        const x = hash(i + 1, Math.floor(t * 0.5)) * 1.1 - 0.05
        const y = 0.2 + hash(i + 2, Math.floor(t) + 0.3) * 0.6 + Math.sin(t + i * 0.2) * 0.1
        const { sx, sy, scale } = project(x, y, z, width, height)
        const size = (4 + hash(i + 3, t) * 12) * scale
        const hueShift = (i % 5) * 15 + Math.sin(t * 0.5) * 10
        const r = Math.round(Math.max(0, Math.min(255, 50 - hueShift)))
        const g = Math.round(Math.max(0, Math.min(255, 220 + hueShift * 0.5)))
        const b = Math.round(Math.max(0, Math.min(255, 200 + hueShift)))
        ctx.fillStyle = `rgba(${r},${g},${b},${(0.7 - z * 0.4)})`
        ctx.globalAlpha = 0.8
        ctx.beginPath()
        ctx.ellipse(sx, sy, size, size * 0.6, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }

    case 'crystalShards': {
      for (let i = 0; i < 45; i++) {
        const z = hash(i, Math.floor(t * 2)) * 0.85
        const x = 0.15 + hash(i + 1, Math.floor(t * 1.2)) * 0.7
        const y = (t * 0.035 + hash(i + 2, Math.floor(t)) * 0.65) % 1.1 - 0.05
        const { sx, sy, scale } = project(x, y, z, width, height)
        const len = (8 + hash(i + 3, t) * 18) * scale
        const rot = t * 0.8 + i * 0.4
        if (sx < -30 || sx > width + 30 || sy < -30 || sy > height + 30) continue
        ctx.save()
        ctx.translate(sx, sy)
        ctx.rotate(rot)
        const grad = ctx.createLinearGradient(-len, -len, len, len)
        grad.addColorStop(0, `rgba(200,230,255,${0.6 - z * 0.3})`)
        grad.addColorStop(0.5, `rgba(255,255,255,${0.9 - z * 0.4})`)
        grad.addColorStop(1, `rgba(180,210,255,${0.5 - z * 0.3})`)
        ctx.fillStyle = grad
        ctx.strokeStyle = `rgba(255,255,255,${0.8 - z * 0.4})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(0, -len)
        ctx.lineTo(len * 0.4, len * 0.3)
        ctx.lineTo(0, len)
        ctx.lineTo(-len * 0.4, len * 0.3)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        ctx.restore()
      }
      break
    }

    case 'goldenMotes': {
      for (let i = 0; i < 65; i++) {
        const z = hash(i, Math.floor(t * 2)) * 0.9
        const x = hash(i + 1, Math.floor(t * 1.5)) * 1.05 - 0.02
        const y = (hash(i + 2, Math.floor(t * 1.5) + 0.5) * 1.05 - 0.02 + t * 0.02) % 1.15 - 0.05
        const { sx, sy, scale } = project(x, y, z, width, height)
        const size = (2 + hash(i + 3, t) * 6) * scale
        const pulse = 0.6 + 0.4 * Math.sin(t * 3 + i * 0.2)
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, size * 2)
        grad.addColorStop(0, `rgba(255,220,100,${pulse * (0.95 - z * 0.5)})`)
        grad.addColorStop(0.5, `rgba(255,200,80,${pulse * 0.5 * (0.9 - z)})`)
        grad.addColorStop(1, 'rgba(255,180,50,0)')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(sx, sy, size * 2, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }

    case 'cosmicDrift': {
      for (let i = 0; i < 50; i++) {
        const z = hash(i, Math.floor(t * 2)) * 0.95
        const x = (hash(i + 1, Math.floor(t * 0.6)) + t * 0.02) % 1.2 - 0.1
        const y = hash(i + 2, Math.floor(t * 0.6) + 0.5) * 1.1 - 0.05
        const { sx, sy, scale } = project(x, y, z, width, height)
        const size = (3 + hash(i + 3, t) * 8) * scale
        const twinkle = 0.4 + 0.6 * Math.sin(t * 2 + i * 0.4)
        const hue = 250 + (i % 4) * 20
        const rr = Math.round(100 + 80 * Math.sin((hue * Math.PI) / 180))
        const gg = Math.round(100 + 80 * Math.sin(((hue + 120) * Math.PI) / 180))
        const bb = 255
        ctx.fillStyle = `rgba(${rr},${gg},${bb},${twinkle * (0.8 - z * 0.5)})`
        ctx.shadowColor = `rgba(${rr},${gg},${bb},0.8)`
        ctx.shadowBlur = 10
        ctx.beginPath()
        ctx.arc(sx, sy, size, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
      }
      break
    }

    default:
      break
  }

  ctx.restore()
}
