/**
 * 10 audio visualizers – each draws inside a given box, synced to bars/level or idle.
 */

import type { VisualizerId } from './videoVisualizers'
import type { VideoStyleTheme } from './videoStyles'

export function drawVisualizer(
  ctx: CanvasRenderingContext2D,
  id: VisualizerId,
  box: { x: number; y: number; w: number; h: number },
  bars: number[],
  level: number,
  theme: VideoStyleTheme,
  timeMs: number,
  opts?: { boostVisibility?: boolean }
): void {
  const parts = (theme.artGlowColor || '148,163,184').split(',').map((s) => Number(s.trim()))
  const r = Number.isFinite(parts[0]) ? parts[0] : 148
  const g = Number.isFinite(parts[1]) ? parts[1] : 163
  const b = Number.isFinite(parts[2]) ? parts[2] : 184
  const N = Math.max(1, bars?.length ?? 48)
  const safeBars = bars && bars.length >= N ? bars : Array.from({ length: N }, (_, i) => 0.2 + 0.25 * Math.sin(timeMs / 120 + i * 0.2))
  const boxW = Math.max(1, box.w)
  const boxH = Math.max(1, box.h)
  const boost = opts?.boostVisibility ?? false
  const lw = (base: number) => (boost ? base * 1.8 : base)
  const alpha = (base: number) => (boost ? Math.min(1, base + 0.35) : base)

  const idle = (i: number) => 0.2 + 0.25 * Math.sin(timeMs / 120 + i * 0.2)
  const getBar = (i: number) => (i < safeBars.length ? safeBars[i] : idle(i))
  const hsl = (h: number, s: number, l: number) => hslToRgb(h / 360, s, l)

  ctx.save()

  switch (id) {
    case 'waveform': {
      const cy = box.y + boxH / 2
      const amp = boxH * 0.42
      ctx.beginPath()
      for (let i = 0; i <= N; i++) {
        const x = box.x + (i / N) * boxW
        const v = getBar(i % N)
        const y = cy - v * amp
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha(0.75 + 0.25 * level)})`
      ctx.lineWidth = lw(4)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.stroke()
      break
    }
    case 'bars': {
      const gap = boost ? 3 : 2
      const bw = Math.max(1, (boxW - (N - 1) * gap) / N)
      const maxH = boxH * (boost ? 0.55 : 0.45)
      for (let i = 0; i < N; i++) {
        const v = getBar(i)
        const h = maxH * (0.15 + 0.85 * v)
        const x = box.x + i * (bw + gap)
        const y = box.y + boxH / 2 - h / 2
        roundRect(ctx, x, y, bw, h, bw / 2)
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha(0.5 + 0.5 * v)})`
        ctx.fill()
      }
      break
    }
    case 'circular': {
      const cx = box.x + boxW / 2
      const cy = box.y + boxH / 2
      const radius = Math.min(boxW, boxH) * 0.42
      for (let i = 0; i < N; i++) {
        const angle = (i / N) * Math.PI * 2 - Math.PI / 2
        const v = getBar(i)
        const len = radius * (0.25 + 0.75 * v)
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(angle) * radius * 0.2, cy + Math.sin(angle) * radius * 0.2)
        ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len)
        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha(0.55 + 0.45 * v)})`
        ctx.lineWidth = lw(3.5)
        ctx.lineCap = 'round'
        ctx.stroke()
      }
      break
    }
    case 'filledArea': {
      const cy = box.y + boxH / 2
      const amp = boxH * 0.45
      ctx.beginPath()
      ctx.moveTo(box.x, cy)
      for (let i = 0; i <= N; i++) {
        const x = box.x + (i / N) * boxW
        const v = getBar(i % N)
        ctx.lineTo(x, cy - v * amp)
      }
      for (let i = N; i >= 0; i--) {
        const x = box.x + (i / N) * boxW
        const v = getBar(i % N)
        ctx.lineTo(x, cy + v * amp)
      }
      ctx.closePath()
      const grad = ctx.createLinearGradient(box.x, box.y, box.x, box.y + boxH)
      grad.addColorStop(0, `rgba(${r},${g},${b},${alpha(0.15)})`)
      grad.addColorStop(0.5, `rgba(${r},${g},${b},${alpha(0.4 + 0.35 * level)})`)
      grad.addColorStop(1, `rgba(${r},${g},${b},${alpha(0.2)})`)
      ctx.fillStyle = grad
      ctx.fill()
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha(0.7)})`
      ctx.lineWidth = lw(1.5)
      ctx.stroke()
      break
    }
    case 'barWave': {
      const cy = box.y + boxH / 2
      const amp = boxH * 0.4
      const barW = Math.max(2, (boxW / N) * 0.7)
      const gap = Math.max(0, (boxW / N) - barW)
      for (let i = 0; i < N; i++) {
        const v = getBar(i)
        const h = amp * (0.2 + 0.8 * v)
        const x = box.x + (i / N) * boxW + gap / 2
        roundRect(ctx, x, cy - h, barW, h * 2, barW / 3)
        const grad = ctx.createLinearGradient(x, cy - h, x, cy + h)
        grad.addColorStop(0, `rgba(${r},${g},${b},${alpha(0.3)})`)
        grad.addColorStop(0.5, `rgba(${r},${g},${b},${alpha(0.7 + 0.3 * v)})`)
        grad.addColorStop(1, `rgba(${r},${g},${b},${alpha(0.3)})`)
        ctx.fillStyle = grad
        ctx.fill()
      }
      break
    }
    case 'rainbowBars': {
      const gap = 1.5
      const bw = Math.max(1, (boxW - (N - 1) * gap) / N)
      const maxH = boxH * 0.5
      for (let i = 0; i < N; i++) {
        const v = getBar(i)
        const h = maxH * (0.2 + 0.8 * v)
        const x = box.x + i * (bw + gap)
        const y = box.y + boxH / 2 - h / 2
        const [rr, gg, bb] = hsl((i / N) * 300 + (timeMs / 50) % 360, 0.85, 0.6)
        roundRect(ctx, x, y, bw, h, bw / 2)
        ctx.fillStyle = `rgba(${rr},${gg},${bb},${alpha(0.6 + 0.4 * v)})`
        ctx.fill()
      }
      break
    }
    case 'glowBars': {
      const gap = 3
      const bw = Math.max(1, (boxW - (N - 1) * gap) / N)
      const maxH = boxH * 0.5
      const glowR = Math.min(bw * 1.5, 12)
      for (let i = 0; i < N; i++) {
        const v = getBar(i)
        const h = maxH * (0.2 + 0.8 * v)
        const cx = box.x + i * (bw + gap) + bw / 2
        const cy = box.y + boxH / 2
        const grad = ctx.createLinearGradient(cx, cy + maxH, cx, cy - maxH)
        grad.addColorStop(0, `rgba(${r},${g},${b},0)`)
        grad.addColorStop(0.4, `rgba(${r},${g},${b},${alpha(0.25 * v)})`)
        grad.addColorStop(0.7, `rgba(${r},${g},${b},${alpha(0.6 * v)})`)
        grad.addColorStop(1, `rgba(255,255,255,${alpha(0.4 + 0.4 * v)})`)
        ctx.fillStyle = grad
        ctx.shadowColor = `rgba(${r},${g},${b},0.9)`
        ctx.shadowBlur = glowR
        ctx.beginPath()
        roundRect(ctx, cx - bw / 2, cy - h / 2, bw, h, bw / 2)
        ctx.fill()
        ctx.shadowBlur = 0
      }
      break
    }
    case 'sunburst': {
      const cx = box.x + boxW / 2
      const cy = box.y + boxH / 2
      const radius = Math.min(boxW, boxH) * 0.45
      ctx.beginPath()
      ctx.arc(cx, cy, radius * 0.12, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(0,0,0,0.6)`
      ctx.fill()
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha(0.8)})`
      ctx.lineWidth = lw(2)
      ctx.stroke()
      for (let i = 0; i < N; i++) {
        const angle = (i / N) * Math.PI * 2 - Math.PI / 2
        const v = getBar(i)
        const len = radius * (0.15 + 0.85 * v)
        const [rr, gg, bb] = hsl((i / N) * 240 + 180, 0.8, 0.55)
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(angle) * radius * 0.1, cy + Math.sin(angle) * radius * 0.1)
        ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len)
        ctx.strokeStyle = `rgba(${rr},${gg},${bb},${alpha(0.6 + 0.4 * v)})`
        ctx.lineWidth = lw(2.5)
        ctx.lineCap = 'round'
        ctx.stroke()
      }
      break
    }
    case 'ripple': {
      const cx = box.x + boxW / 2
      const cy = box.y + boxH / 2
      const maxR = Math.min(boxW, boxH) * 0.48
      const numRings = 12
      for (let k = 0; k < numRings; k++) {
        const idx = (k / numRings) * N
        const v = getBar(Math.floor(idx) % N) * 0.5 + getBar(Math.floor(idx + 2) % N) * 0.5
        const wave = Math.sin(timeMs / 80 + k * 1.5) * 0.15 * maxR
        const radius = maxR * (0.15 + (k / numRings) * 0.85) * (0.7 + 0.3 * v) + wave
        ctx.beginPath()
        ctx.arc(cx, cy, radius, 0, Math.PI * 2)
        const [rr, gg, bb] = hsl(200 - (k / numRings) * 120, 0.75, 0.55)
        ctx.strokeStyle = `rgba(${rr},${gg},${bb},${alpha(0.2 + 0.5 * v)})`
        ctx.lineWidth = lw(2)
        ctx.stroke()
      }
      break
    }
    case 'radial': {
      const cx = box.x + boxW / 2
      const cy = box.y + boxH / 2
      const radius = Math.min(boxW, boxH) * 0.4
      for (let i = 0; i < N; i++) {
        const angle = (i / N) * Math.PI * 1.6 - Math.PI * 0.8
        const v = getBar(i)
        const len = radius * (0.2 + 0.8 * v)
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(angle) * radius * 0.15, cy + Math.sin(angle) * radius * 0.15)
        ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len)
        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha(0.5 + 0.4 * v)})`
        ctx.lineWidth = lw(3)
        ctx.lineCap = 'round'
        ctx.stroke()
      }
      break
    }
    case 'wave': {
      const cy = box.y + boxH / 2
      const amp = boxH * 0.4
      ctx.beginPath()
      for (let i = 0; i <= N; i++) {
        const x = box.x + (i / N) * boxW
        const v = getBar(i % N)
        const y = cy - v * amp
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha(0.6 + 0.3 * level)})`
      ctx.lineWidth = lw(2.5)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.stroke()
      break
    }
    case 'waveMirror': {
      const cy = box.y + boxH / 2
      const amp = boxH * 0.35
      ctx.beginPath()
      for (let i = 0; i <= N; i++) {
        const x = box.x + (i / N) * boxW
        const v = getBar(i % N)
        const yTop = cy - v * amp
        if (i === 0) {
          ctx.moveTo(x, yTop)
        } else {
          ctx.lineTo(x, yTop)
        }
      }
      for (let i = N; i >= 0; i--) {
        const x = box.x + (i / N) * boxW
        const v = getBar(i % N)
        ctx.lineTo(x, cy + v * amp)
      }
      ctx.closePath()
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha(0.25 + 0.4 * level)})`
      ctx.fill()
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha(0.7)})`
      ctx.lineWidth = lw(1.5)
      ctx.stroke()
      break
    }
    case 'circleDots': {
      const cx = box.x + boxW / 2
      const cy = box.y + boxH / 2
      const baseR = Math.min(boxW, boxH) * 0.35
      for (let i = 0; i < N; i++) {
        const angle = (i / N) * Math.PI * 2 - Math.PI / 2
        const v = getBar(i)
        const radius = baseR + v * baseR * 0.5
        const x = cx + Math.cos(angle) * radius
        const y = cy + Math.sin(angle) * radius
        ctx.beginPath()
        ctx.arc(x, y, 4 + v * 6, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha(0.5 + 0.5 * v)})`
        ctx.fill()
      }
      break
    }
    case 'rings': {
      const cx = box.x + boxW / 2
      const cy = box.y + boxH / 2
      const maxR = Math.min(boxW, boxH) * 0.45
      const numRings = 8
      for (let k = 0; k < numRings; k++) {
        const idx = Math.floor((k / numRings) * N)
        const v = getBar(idx)
        const radius = maxR * (0.2 + (k / numRings) * 0.8) * (0.7 + 0.3 * v)
        ctx.beginPath()
        ctx.arc(cx, cy, radius, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha(0.2 + 0.5 * v)})`
        ctx.lineWidth = lw(2)
        ctx.stroke()
      }
      break
    }
    case 'mountain': {
      const cy = box.y + boxH * 0.7
      const amp = boxH * 0.6
      ctx.beginPath()
      ctx.moveTo(box.x, box.y + boxH)
      ctx.lineTo(box.x, cy)
      for (let i = 0; i <= N; i++) {
        const x = box.x + (i / N) * boxW
        const v = getBar(i % N)
        ctx.lineTo(x, cy - v * amp)
      }
      ctx.lineTo(box.x + boxW, box.y + boxH)
      ctx.closePath()
      const grad = ctx.createLinearGradient(box.x, box.y, box.x, box.y + boxH)
      grad.addColorStop(0, `rgba(${r},${g},${b},0.05)`)
      grad.addColorStop(0.5, `rgba(${r},${g},${b},${alpha(0.2 + 0.4 * level)})`)
      grad.addColorStop(1, `rgba(${r},${g},${b},0.1)`)
      ctx.fillStyle = grad
      ctx.fill()
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha(0.6)})`
      ctx.lineWidth = lw(1.5)
      ctx.stroke()
      break
    }
    case 'arcBars': {
      const cx = box.x + boxW / 2
      const cy = box.y + boxH * 0.6
      const radius = Math.min(boxW, boxH) * 0.5
      const startAngle = Math.PI * 0.2
      const endAngle = Math.PI * 0.8
      for (let i = 0; i < N; i++) {
        const a0 = startAngle + (i / N) * (endAngle - startAngle)
        const a1 = startAngle + ((i + 1) / N) * (endAngle - startAngle)
        const v = getBar(i)
        const r0 = radius * 0.3
        const r1 = radius * (0.3 + 0.7 * v)
        ctx.beginPath()
        ctx.arc(cx, cy, r0, a0, a1)
        ctx.arc(cx, cy, r1, a1, a0, true)
        ctx.closePath()
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha(0.35 + 0.5 * v)})`
        ctx.fill()
      }
      break
    }
    case 'pulse': {
      const cx = box.x + boxW / 2
      const cy = box.y + boxH / 2
      const baseR = Math.min(boxW, boxH) * 0.15
      const pulseR = baseR * (1 + level * 1.2)
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, pulseR)
      grad.addColorStop(0, `rgba(${r},${g},${b},${alpha(0.5 + 0.4 * level)})`)
      grad.addColorStop(0.6, `rgba(${r},${g},${b},${0.2 * level})`)
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(cx, cy, pulseR, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha(0.6 + 0.3 * level)})`
      ctx.lineWidth = lw(2)
      ctx.stroke()
      break
    }
    case 'particles': {
      const numParticles = 40
      for (let i = 0; i < numParticles; i++) {
        const v = getBar(Math.floor((i / numParticles) * N))
        const x = box.x + ((i * 1.7) % 1) * boxW
        const y = box.y + boxH * (0.2 + 0.6 * ((i * 0.3) % 1))
        const size = 3 + v * 8
        ctx.beginPath()
        ctx.arc(x, y, size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha(0.3 + 0.6 * v)})`
        ctx.fill()
      }
      break
    }
    case 'orbitRings': {
      const cx = box.x + boxW / 2
      const cy = box.y + boxH / 2
      const maxR = Math.min(boxW, boxH) * 0.45
      const numRings = 5
      for (let k = 0; k < numRings; k++) {
        const rot = (timeMs / 800 + k * 0.4) % (Math.PI * 2)
        const idx = Math.floor(((k / numRings) * N + timeMs / 100) % N)
        const v = getBar(idx)
        const radius = maxR * (0.25 + (k / numRings) * 0.7) * (0.75 + 0.25 * v)
        const [rr, gg, bb] = hsl((k / numRings) * 360 + (timeMs / 80) % 360, 0.9, 0.6)
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(rot)
        ctx.beginPath()
        ctx.arc(0, 0, radius, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(${rr},${gg},${bb},${alpha(0.4 + 0.5 * v)})`
        ctx.lineWidth = lw(2.5)
        ctx.stroke()
        ctx.restore()
      }
      break
    }
    case 'spiral': {
      const cx = box.x + boxW / 2
      const cy = box.y + boxH / 2
      const maxR = Math.min(boxW, boxH) * 0.42
      const turns = 3
      const points = 60
      ctx.beginPath()
      for (let i = 0; i <= points; i++) {
        const t = i / points
        const angle = t * Math.PI * 2 * turns - Math.PI / 2 + (timeMs / 600) * Math.PI * 2
        const idx = (i / points) * N
        const v = getBar(Math.floor(idx) % N) * 0.5 + getBar(Math.floor(idx + 1) % N) * 0.5
        const radius = maxR * t * (0.4 + 0.6 * v)
        const x = cx + Math.cos(angle) * radius
        const y = cy + Math.sin(angle) * radius
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = `rgba(148,163,184,${alpha(0.3)})`
      ctx.lineWidth = lw(1.5)
      ctx.stroke()
      for (let i = 0; i <= points; i += 2) {
        const t = i / points
        const angle = t * Math.PI * 2 * turns - Math.PI / 2 + (timeMs / 600) * Math.PI * 2
        const idx = (i / points) * N
        const v = getBar(Math.floor(idx) % N)
        const radius = maxR * t * (0.4 + 0.6 * v)
        const x = cx + Math.cos(angle) * radius
        const y = cy + Math.sin(angle) * radius
        const [rr, gg, bb] = hsl((t * 300 + timeMs / 60) % 360, 0.9, 0.55)
        ctx.beginPath()
        ctx.arc(x, y, 3 + v * 5, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${rr},${gg},${bb},${alpha(0.7 + 0.3 * v)})`
        ctx.fill()
      }
      break
    }
    case 'vortex': {
      const cx = box.x + boxW / 2
      const cy = box.y + boxH / 2
      const maxR = Math.min(boxW, boxH) * 0.46
      const spin = (timeMs / 500) * Math.PI * 2
      for (let i = 0; i < N; i++) {
        const angle = (i / N) * Math.PI * 2 - Math.PI / 2 + spin + (i % 2) * Math.PI
        const v = getBar(i)
        const len = maxR * (0.2 + 0.8 * v)
        const innerR = maxR * 0.15
        const [rr, gg, bb] = hsl(220 + (i / N) * 120 + (timeMs / 40) % 60, 0.85, 0.55)
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR)
        ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len)
        ctx.strokeStyle = `rgba(${rr},${gg},${bb},${alpha(0.5 + 0.5 * v)})`
        ctx.lineWidth = lw(3)
        ctx.lineCap = 'round'
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.arc(cx, cy, maxR * 0.08, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255,255,255,${alpha(0.8)})`
      ctx.fill()
      break
    }
    case 'neonRing': {
      const cx = box.x + boxW / 2
      const cy = box.y + boxH / 2
      const maxR = Math.min(boxW, boxH) * 0.4
      const numRings = 8
      for (let k = 0; k < numRings; k++) {
        const idx = Math.floor((k / numRings) * N + (timeMs / 80) % N)
        const v = getBar(idx % N)
        const wave = Math.sin(timeMs / 120 + k * 0.8) * 0.1 * maxR
        const radius = maxR * (0.2 + (k / numRings) * 0.8) * (0.8 + 0.2 * v) + wave
        const hue = (k / numRings) * 360 + (timeMs / 50) % 360
        const [rr, gg, bb] = hsl(hue, 1, 0.6)
        ctx.save()
        ctx.shadowColor = `rgba(${rr},${gg},${bb},0.9)`
        ctx.shadowBlur = 12 + v * 8
        ctx.beginPath()
        ctx.arc(cx, cy, radius, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(${rr},${gg},${bb},${alpha(0.6 + 0.4 * v)})`
        ctx.lineWidth = lw(2.5)
        ctx.stroke()
        ctx.restore()
      }
      break
    }
    case 'crystalOrb': {
      const cx = box.x + boxW / 2
      const cy = box.y + boxH / 2
      const baseR = Math.min(boxW, boxH) * 0.38
      const pulseR = baseR * (0.9 + 0.2 * level + 0.1 * Math.sin(timeMs / 200))
      const grad = ctx.createRadialGradient(cx - pulseR * 0.3, cy - pulseR * 0.3, 0, cx, cy, pulseR)
      grad.addColorStop(0, `rgba(255,255,255,${alpha(0.5 + 0.3 * level)})`)
      grad.addColorStop(0.3, `rgba(147,197,253,${alpha(0.4 + 0.3 * level)})`)
      grad.addColorStop(0.6, `rgba(129,140,248,${alpha(0.25 * level)})`)
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(cx, cy, pulseR, 0, Math.PI * 2)
      ctx.fill()
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2 - Math.PI / 2 + timeMs / 400
        const v = getBar(Math.floor((i / 12) * N) % N)
        const len = pulseR * (0.5 + 0.5 * v)
        const [rr, gg, bb] = hsl(250 + (i / 12) * 60, 0.8, 0.65)
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len)
        ctx.strokeStyle = `rgba(${rr},${gg},${bb},${alpha(0.6 + 0.4 * v)})`
        ctx.lineWidth = lw(2)
        ctx.lineCap = 'round'
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.arc(cx, cy, pulseR * 0.15, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255,255,255,${alpha(0.9)})`
      ctx.fill()
      break
    }
    default:
      break
  }

  ctx.restore()
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

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r: number, g: number, b: number
  if (s === 0) {
    r = g = b = l
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
}
function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1
  if (t > 1) t -= 1
  if (t < 1 / 6) return p + (q - p) * 6 * t
  if (t < 1 / 2) return q
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
  return p
}
