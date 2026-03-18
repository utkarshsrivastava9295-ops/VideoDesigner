/**
 * Lyric sync: LRC, SRT, ASS parsing and AI extraction via Whisper Large V3.
 */

/** ASS style properties parsed from .ass file */
export type AssStyle = {
  fontName: string
  fontSize: number
  color?: string
  secondaryColor?: string
  outlineColor?: string
  shadowColor?: string
  outlineWidth: number
  shadowDepth: number
  bold: boolean
  italic: boolean
  alignment: number
  marginL: number
  marginR: number
  marginV: number
}

/** Optional lyric style overrides from form. Applied on top of ASS or as sole style when no ASS. */
export type LyricStyleOverrides = {
  fontName?: string
  fontSize?: number
  primaryColor?: string
  secondaryColor?: string
  outlineColor?: string
  shadowColor?: string
  outlineWidth?: number
  shadowDepth?: number
  bold?: boolean
  italic?: boolean
  alignment?: number
  marginV?: number
}

/** Parse user color input: #RRGGBB or ASS &HBBGGRR& / &HAABBGGRR& → CSS color */
export function parseLyricStyleColor(input: string): string {
  const s = input.trim()
  if (!s) return ''
  if (s.startsWith('#')) return s
  return assColorToCss(s)
}

/** Default AssStyle (e.g. Century Gothic, red, center, margins) when no ASS/base */
const DEFAULT_LYRIC_STYLE: AssStyle = {
  fontName: 'Century Gothic',
  fontSize: 41,
  color: '#FF0000',
  bold: false,
  italic: true,
  alignment: 5,
  marginL: 0,
  marginR: 0,
  marginV: 38,
  outlineColor: '#EDD4D4',
  shadowColor: '#EA6262',
  outlineWidth: 2,
  shadowDepth: 2,
}

/** Merge form overrides onto base AssStyle. Returns new AssStyle. */
export function mergeLyricStyleOverrides(
  base: AssStyle | null,
  overrides: LyricStyleOverrides | null | undefined
): AssStyle | null {
  if (!overrides || Object.keys(overrides).length === 0) return base
  const defaults: AssStyle = base ?? DEFAULT_LYRIC_STYLE
  const pc = overrides.primaryColor?.trim()
  const sc = overrides.secondaryColor?.trim()
  const oc = overrides.outlineColor?.trim()
  const shc = overrides.shadowColor?.trim()
  return {
    ...defaults,
    fontName: overrides.fontName ?? defaults.fontName,
    fontSize: overrides.fontSize ?? defaults.fontSize,
    color: pc ? parseLyricStyleColor(pc) : defaults.color,
    secondaryColor: sc ? parseLyricStyleColor(sc) : defaults.secondaryColor,
    outlineColor: oc ? parseLyricStyleColor(oc) : defaults.outlineColor,
    shadowColor: shc ? parseLyricStyleColor(shc) : defaults.shadowColor,
    outlineWidth: overrides.outlineWidth ?? defaults.outlineWidth,
    shadowDepth: overrides.shadowDepth ?? defaults.shadowDepth,
    bold: overrides.bold ?? defaults.bold,
    italic: overrides.italic ?? defaults.italic,
    alignment: overrides.alignment ?? defaults.alignment,
    marginV: overrides.marginV ?? defaults.marginV,
  }
}

/** Zoom/pop-in effect parsed from \\t(0,300,\\fscx115\\fscy115) */
export type LyricZoomEffect = { t1: number; t2: number; scaleX: number; scaleY: number }

/** Fade effect: \\fad(fade_in_ms, fade_out_ms) */
export type LyricFadeEffect = { fadeIn: number; fadeOut: number }

/** Move effect: \\move(x1,y1,x2,y2,t1,t2) - coords in script resolution */
export type LyricMoveEffect = { x1: number; y1: number; x2: number; y2: number; t1: number; t2: number }

/** Karaoke segment: { text, durationMs } from \\kf or \\k */
export type LyricKaraokeSegment = { text: string; durationMs: number }

/** Parsed lyric line with timestamp (ms from start). assStyle from .ass file. */
export type LyricLine = {
  timeMs: number
  endTimeMs?: number
  text: string
  color?: string
  assStyle?: AssStyle
  zoomEffect?: LyricZoomEffect
  fadeEffect?: LyricFadeEffect
  moveEffect?: LyricMoveEffect
  karaokeSegments?: LyricKaraokeSegment[]
}

/** Result of parsing lyrics – either synced (timestamps) or plain (even distribution). scriptRes from ASS [Script Info] for scaling. */
export type ParsedLyrics =
  | { type: 'synced'; lines: LyricLine[]; scriptRes?: { x: number; y: number } }
  | { type: 'plain'; lines: string[] }

export type LyricFileFormat = 'lrc' | 'srt' | 'ass'

/** Parse LRC, SRT, or ASS file content into ParsedLyrics */
export function parseLyricFile(content: string, format: LyricFileFormat): ParsedLyrics {
  const trimmed = content.trim()
  if (!trimmed) return { type: 'plain', lines: [] }
  switch (format) {
    case 'lrc':
      return parseLyrics(trimmed)
    case 'srt':
      return parseSrt(trimmed)
    case 'ass':
      return parseAss(trimmed)
    default:
      return { type: 'plain', lines: trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) }
  }
}

/** Parse SRT format: "1\n00:00:01,000 --> 00:00:04,000\nLine text\n\n" */
function parseSrt(content: string): ParsedLyrics {
  const blocks = content.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)
  const lines: LyricLine[] = []
  const timeRe = /(\d{2}):(\d{2}):(\d{2})[,.](\d{1,3})/
  for (const block of blocks) {
    const parts = block.split(/\n/)
    const timeLine = parts.find((p) => p.includes('-->'))
    if (!timeLine) continue
    const startMatch = timeLine.match(timeRe)
    if (!startMatch) continue
    const timeMs =
      parseInt(startMatch[1], 10) * 3600000 +
      parseInt(startMatch[2], 10) * 60000 +
      parseInt(startMatch[3], 10) * 1000 +
      (startMatch[4].length === 1 ? parseInt(startMatch[4], 10) * 100 : startMatch[4].length === 2 ? parseInt(startMatch[4], 10) * 10 : parseInt(startMatch[4].slice(0, 3), 10))
    const text = parts
      .slice(parts.indexOf(timeLine) + 1)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (text) lines.push({ timeMs, text })
  }
  return lines.length > 0 ? { type: 'synced', lines } : { type: 'plain', lines: [] }
}

/** Convert ASS color &HBBGGRR& or &HAABBGGRR& to CSS #RRGGBB or rgba */
function assColorToCss(assVal: string): string {
  const hex = assVal.replace(/&/g, '').toLowerCase()
  let bgr: string
  let alphaHex: string | undefined
  const m6 = hex.match(/^h([0-9a-f]{6})$/)
  const m8 = hex.match(/^h([0-9a-f]{8})$/)
  if (m8) {
    alphaHex = m8[1].slice(0, 2)
    bgr = m8[1].slice(2, 8)
  } else if (m6) {
    bgr = m6[1]
  } else {
    const m2 = hex.match(/^h([0-9a-f]{2})$/)
    const m4 = hex.match(/^h([0-9a-f]{4})$/)
    if (m2) bgr = '0000' + m2[1]
    else if (m4) bgr = '00' + m4[1]
    else {
      const dec = parseInt(assVal, 10)
      if (!Number.isNaN(dec)) {
        const n = dec >>> 0
        bgr = (n & 0xffffff).toString(16).padStart(6, '0')
        if (n > 0xffffff) alphaHex = ((n >>> 24) & 0xff).toString(16).padStart(2, '0')
      } else return ''
    }
  }
  const rr = parseInt(bgr.slice(4, 6), 16)
  const gg = parseInt(bgr.slice(2, 4), 16)
  const bb = parseInt(bgr.slice(0, 2), 16)
  if (alphaHex !== undefined) {
    const a = 1 - parseInt(alphaHex, 16) / 255
    return `rgba(${rr},${gg},${bb},${a.toFixed(2)})`
  }
  return `#${bgr.slice(4, 6)}${bgr.slice(2, 4)}${bgr.slice(0, 2)}`
}

/** Parse numeric ASS value: -1 = true for bold/italic, else number */
function parseAssBool(val: string): boolean {
  const n = parseInt(val, 10)
  return n === -1 || n > 0
}

/** Parse ASS time H:MM:SS.cc to milliseconds */
function parseAssTime(s: string): number {
  const m = s.trim().match(/(\d+):(\d{2}):(\d{2})\.(\d{2})/)
  if (!m) return 0
  return (
    parseInt(m[1], 10) * 3600000 +
    parseInt(m[2], 10) * 60000 +
    parseInt(m[3], 10) * 1000 +
    parseInt(m[4], 10) * 10
  )
}

/** Parse \\t(0,300,\\fscx115\\fscy115) zoom effect */
function parseZoomEffect(rawText: string): LyricZoomEffect | undefined {
  const m = rawText.match(/\\t\s*\(\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?,\s*\\fscx(\d+)\\fscy(\d+)\s*\)/)
  if (!m) return undefined
  return {
    t1: parseInt(m[1], 10),
    t2: parseInt(m[2], 10),
    scaleX: parseInt(m[3], 10) || 100,
    scaleY: parseInt(m[4], 10) || 100,
  }
}

/** Parse \\fad(fade_in, fade_out) - values in ms */
function parseFadeEffect(rawText: string): LyricFadeEffect | undefined {
  const m = rawText.match(/\\fad\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/)
  if (!m) return undefined
  return { fadeIn: parseInt(m[1], 10), fadeOut: parseInt(m[2], 10) }
}

/** Parse \\move(x1,y1,x2,y2,t1,t2) */
function parseMoveEffect(rawText: string): LyricMoveEffect | undefined {
  const m = rawText.match(/\\move\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/)
  if (!m) return undefined
  return {
    x1: parseInt(m[1], 10),
    y1: parseInt(m[2], 10),
    x2: parseInt(m[3], 10),
    y2: parseInt(m[4], 10),
    t1: parseInt(m[5], 10),
    t2: parseInt(m[6], 10),
  }
}

/** Parse \\kf or \\k segments. \\kf139 = 139 centiseconds. Each \kfN applies to text after it until next \kf. */
function parseKaraokeSegments(rawText: string): LyricKaraokeSegment[] | undefined {
  const segments: LyricKaraokeSegment[] = []
  const tagRe = /\{[^}]*\\kf?(\d+)[^}]*\}|\\kf?(\d+)/g
  let lastEnd = 0
  let m: RegExpExecArray | null
  while ((m = tagRe.exec(rawText)) !== null) {
    const durCs = parseInt(m[1] ?? m[2] ?? '0', 10)
    const textAfter = rawText.slice(m.index + m[0].length)
    const nextK = textAfter.search(/\{[^}]*\\kf?\d+|\\kf?\d+/)
    const segText = (nextK >= 0 ? textAfter.slice(0, nextK) : textAfter)
      .replace(/\{[^}]*\}/g, '')
      .replace(/\\N/g, ' ')
      .trim()
    if (segText || durCs > 0) segments.push({ text: segText || ' ', durationMs: durCs * 10 })
    lastEnd = m.index + m[0].length + (nextK >= 0 ? nextK : textAfter.length)
  }
  if (segments.length === 0) return undefined
  return segments
}

/** Extract inline override from text: \fn, \fs, \b, \i, \a, \an, \c */
function parseAssOverrides(rawText: string): Partial<AssStyle> & { color?: string } {
  const out: Partial<AssStyle> & { color?: string } = {}
  const fn = rawText.match(/\\fn([^\\}]+)/)
  if (fn) out.fontName = fn[1].trim()
  const fs = rawText.match(/\\fs(-?\d+)/)
  if (fs) out.fontSize = parseInt(fs[1], 10)
  const b = rawText.match(/\\b([01])/)
  if (b) out.bold = b[1] === '1'
  const i = rawText.match(/\\i([01])/)
  if (i) out.italic = i[1] === '1'
  const an = rawText.match(/\\an([1-9])/)
  if (an) out.alignment = parseInt(an[1], 10)
  else {
    const a = rawText.match(/\\a([1-9])/)
    if (a) out.alignment = parseInt(a[1], 10)
  }
  const c = rawText.match(/\\(?:1c|c)&H([0-9A-Fa-f]{2,8})&?/)
  if (c) out.color = assColorToCss('&H' + c[1] + '&')
  return out
}

/** Parse ASS: [Script Info] PlayRes, [V4+ Styles], [Events] Dialogue */
function parseAss(content: string): ParsedLyrics {
  let scriptRes: { x: number; y: number } | undefined
  const styles: Record<string, AssStyle> = {}
  let inScriptInfo = false
  let inStyles = false
  let styleFormat: string[] = []
  const dialogueLines: LyricLine[] = []

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.startsWith('[')) {
      inScriptInfo = /\[script\s+info\]/i.test(line)
      inStyles = /\[v4(?:\s*\+\s*)?\s*styles?\s*\]/i.test(line)
      continue
    }
    if (inScriptInfo) {
      const resX = line.match(/^PlayResX:\s*(\d+)/i)
      const resY = line.match(/^PlayResY:\s*(\d+)/i)
      if (resX) scriptRes = { ...(scriptRes ?? { x: 384, y: 288 }), x: parseInt(resX[1], 10) }
      if (resY) scriptRes = { ...(scriptRes ?? { x: 384, y: 288 }), y: parseInt(resY[1], 10) }
      continue
    }
    if (inStyles && line.toLowerCase().startsWith('format:')) {
      styleFormat = line.slice(7).split(',').map((s) => s.trim().toLowerCase())
      continue
    }
    if (inStyles && line.toLowerCase().startsWith('style:')) {
      const fields = line.slice(6).split(',')
      const get = (key: string) => {
        const i = styleFormat.indexOf(key)
        return i >= 0 ? fields[i]?.trim() : ''
      }
      const name = get('name')
      if (!name) continue
      const fontName = get('fontname') || 'Arial'
      const fontSize = parseInt(get('fontsize'), 10) || 20
      const color = assColorToCss(get('primarycolour'))
      const secondaryColor = assColorToCss(get('secondarycolour'))
      const outlineColor = assColorToCss(get('tertiarycolour'))
      const shadowColor = assColorToCss(get('backcolour'))
      const outlineWidth = Math.max(0, parseInt(get('outline'), 10) || 0)
      const shadowDepth = Math.max(0, parseInt(get('shadow'), 10) || 0)
      const bold = parseAssBool(get('bold'))
      const italic = parseAssBool(get('italic'))
      const alignment = parseInt(get('alignment'), 10) || 2
      const marginL = parseInt(get('marginl'), 10) || 0
      const marginR = parseInt(get('marginr'), 10) || 0
      const marginV = parseInt(get('marginv'), 10) || 0
      styles[name] = {
        fontName,
        fontSize,
        color: color || undefined,
        secondaryColor: secondaryColor || undefined,
        outlineColor: outlineColor || undefined,
        shadowColor: shadowColor || undefined,
        outlineWidth,
        shadowDepth,
        bold,
        italic,
        alignment,
        marginL,
        marginR,
        marginV,
      }
      continue
    }
    if (!line.startsWith('Dialogue:')) continue
    const parts = line.slice(9).split(',')
    if (parts.length < 10) continue
    const startStr = parts[1]?.trim() || ''
    const endStr = parts[2]?.trim() || ''
    const timeMs = parseAssTime(startStr)
    const endTimeMs = endStr ? parseAssTime(endStr) : undefined
    const styleName = parts[3]?.trim() || 'Default'
    const rawText = parts.slice(9).join(',')
    const baseStyle = styles[styleName] || styles['Default'] || styles['*Default']
    const overrides = parseAssOverrides(rawText)
    const assStyle: AssStyle = baseStyle
      ? {
          fontName: overrides.fontName ?? baseStyle.fontName,
          fontSize: overrides.fontSize ?? baseStyle.fontSize,
          color: overrides.color ?? baseStyle.color,
          secondaryColor: baseStyle.secondaryColor,
          outlineColor: baseStyle.outlineColor,
          shadowColor: baseStyle.shadowColor,
          outlineWidth: baseStyle.outlineWidth,
          shadowDepth: baseStyle.shadowDepth,
          bold: overrides.bold ?? baseStyle.bold,
          italic: overrides.italic ?? baseStyle.italic,
          alignment: overrides.alignment ?? baseStyle.alignment,
          marginL: baseStyle.marginL,
          marginR: baseStyle.marginR,
          marginV: baseStyle.marginV,
        }
      : {
          fontName: overrides.fontName ?? 'Arial',
          fontSize: overrides.fontSize ?? 20,
          color: overrides.color,
          secondaryColor: undefined,
          outlineColor: undefined,
          shadowColor: undefined,
          outlineWidth: 0,
          shadowDepth: 0,
          bold: overrides.bold ?? false,
          italic: overrides.italic ?? false,
          alignment: overrides.alignment ?? 2,
          marginL: 0,
          marginR: 0,
          marginV: 0,
        }
    const text = rawText
      .replace(/\\N/g, ' ')
      .replace(/\{[^}]*\}/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (text) {
      const color = assStyle.color ?? (overrides.color || '')
      const zoomEffect = parseZoomEffect(rawText)
      const fadeEffect = parseFadeEffect(rawText)
      const moveEffect = parseMoveEffect(rawText)
      const karaokeSegments = parseKaraokeSegments(rawText)
      dialogueLines.push({
        timeMs,
        ...(endTimeMs ? { endTimeMs } : {}),
        text,
        ...(color ? { color } : {}),
        assStyle,
        ...(zoomEffect ? { zoomEffect } : {}),
        ...(fadeEffect ? { fadeEffect } : {}),
        ...(moveEffect ? { moveEffect } : {}),
        ...(karaokeSegments ? { karaokeSegments } : {}),
      })
    }
  }
  dialogueLines.sort((a, b) => a.timeMs - b.timeMs)
  return dialogueLines.length > 0
    ? { type: 'synced', lines: dialogueLines, ...(scriptRes ? { scriptRes } : {}) }
    : { type: 'plain', lines: [] }
}

const LRC_LINE_RE = /^(\[[\d:.]+\])\s*(.*)$/
const LRC_TIME_RE = /\[(\d+):(\d{1,2})(?:\.(\d{1,3}))?\]/

/** Parse LRC timestamp [mm:ss.xx] or [mm:ss] to milliseconds */
function parseLrcTime(match: RegExpMatchArray): number {
  const min = parseInt(match[1] || '0', 10)
  const sec = parseInt(match[2] || '0', 10)
  const frac = match[3] || '00'
  const fracLen = frac.length
  const ms = fracLen === 1 ? parseInt(frac, 10) * 100 : fracLen === 2 ? parseInt(frac, 10) * 10 : parseInt(frac.slice(0, 3), 10)
  return min * 60_000 + sec * 1000 + ms
}

/**
 * Parse lyrics string. If LRC format detected ([mm:ss.xx] tags), returns synced lines.
 * Otherwise returns plain lines for even distribution.
 */
export function parseLyrics(raw: string): ParsedLyrics {
  const trimmed = raw.trim()
  if (!trimmed) return { type: 'plain', lines: [] }

  const inputLines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const syncedLines: LyricLine[] = []
  let hasValidTimestamp = false

  for (const line of inputLines) {
    const tags: number[] = []
    let rest = line

    // Extract all [mm:ss.xx] tags from the start (LRC allows multiple timestamps for same line)
    while (true) {
      const m = rest.match(LRC_LINE_RE)
      if (!m) break
      const timeMatch = m[1].match(LRC_TIME_RE)
      if (timeMatch) {
        tags.push(parseLrcTime(timeMatch))
        hasValidTimestamp = true
      }
      rest = m[2].trim()
    }

    // If no leading tag, try inline [mm:ss.xx] at start of remaining
    if (tags.length === 0) {
      const inline = rest.match(/^\[(\d+):(\d{1,2})(?:\.(\d{1,3}))?\]\s*(.*)$/)
      if (inline) {
        const t = parseLrcTime(inline)
        tags.push(t)
        rest = inline[4] || ''
        hasValidTimestamp = true
      }
    }

    const text = rest.replace(/\s+/g, ' ').trim()
    if (!text && !/^\[[\d:.]+\]/.test(line)) continue // skip metadata like [ar:Artist]

    if (tags.length > 0) {
      for (const t of tags) {
        syncedLines.push({ timeMs: t, text })
      }
    }
  }

  if (hasValidTimestamp && syncedLines.length > 0) {
    syncedLines.sort((a, b) => a.timeMs - b.timeMs)
    return { type: 'synced', lines: syncedLines }
  }

  const plainLines = inputLines
    .filter((l) => !/^\[[\w]+:.*\]$/.test(l))
    .map((l) => l.replace(/^\[[\d:.]+\]\s*/, '').trim())
    .filter(Boolean)
  return { type: 'plain', lines: plainLines }
}

/**
 * Find the current lyric line index at timeMs for synced lyrics.
 * Returns -1 if before first line, or index of the line that should be shown.
 */
/**
 * Resolve lyrics for rendering: file > text box > AI extract.
 * Returns ParsedLyrics. If includeLyrics but nothing provided, extracts from audio when possible.
 */
export async function resolveLyricsForRender(
  options: {
    includeLyrics: boolean
    lyricFile: File | null
    lyricFileFormat: 'lrc' | 'srt' | 'ass' | null
    lyrics: string
    audioFile: File | null
    replicateApiKey?: string
    /** Local Whisper API URL (e.g. http://127.0.0.1:8002). Used when no Replicate key. */
    localWhisperUrl?: string
    onStatus?: (msg: string) => void
  }
): Promise<ParsedLyrics> {
  const { includeLyrics, lyricFile, lyricFileFormat, lyrics, audioFile, replicateApiKey, localWhisperUrl, onStatus } = options
  if (!includeLyrics) return { type: 'plain', lines: [] }

  if (lyricFile && lyricFileFormat) {
    const content = await lyricFile.text()
    return parseLyricFile(content, lyricFileFormat)
  }

  if (lyrics.trim()) {
    return parseLyrics(lyrics)
  }

  if (audioFile) {
    if (getApiKey(replicateApiKey)) {
      onStatus?.('Extracting lyrics from audio with Whisper (Replicate)…')
      try {
        const lrc = await extractLyricsFromAudio(audioFile, replicateApiKey || '', onStatus)
        return parseLyrics(lrc)
      } catch {
        onStatus?.('Replicate failed, trying local Whisper…')
      }
    }
    const localUrl = localWhisperUrl?.trim()
    if (localUrl) {
      try {
        onStatus?.('Extracting lyrics with local Whisper server…')
        const lrc = await extractLyricsFromLocalServer(audioFile, localUrl, onStatus)
        return parseLyrics(lrc)
      } catch (e) {
        console.warn('Local Whisper server failed:', e)
        onStatus?.('Local server failed, trying in-browser model…')
      }
    }
    onStatus?.('Extracting lyrics from audio with local Whisper…')
    try {
      const lrc = await extractLyricsFromAudioLocal(audioFile, onStatus)
      return parseLyrics(lrc)
    } catch (e) {
      console.warn('Local Whisper extraction failed:', e)
      onStatus?.('Lyric extraction failed. Try Replicate API key, or ensure HuggingFace model can download.')
    }
  } else {
    onStatus?.('No audio for lyric extraction. Add an audio file or use a video with embedded audio.')
  }

  return { type: 'plain', lines: [] }
}

export function getCurrentLineIndex(lines: LyricLine[], timeMs: number): number {
  if (!lines.length) return -1
  let idx = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].timeMs <= timeMs) idx = i
    else break
  }
  return idx
}

const REPLICATE_API = 'https://api.replicate.com/v1'
const WHISPER_VERSION = 'f7d5b9ce362128544451c3f05dd6a1068dcb6bc9d3b8473398516d036f1dc859'

/** Parse JSON; if response is HTML (e.g. error page), throw a clear error. */
async function parseJsonResponse(res: Response): Promise<unknown> {
  const text = await res.text()
  const trimmed = text.trim()
  if (trimmed.startsWith('<') || trimmed.startsWith('<!')) {
    throw new Error(
      'Server returned HTML instead of JSON. This can mean: ' +
      'invalid API URL, CORS block, proxy error, or network issue. ' +
      'Try without Replicate key to use local Whisper instead.'
    )
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Invalid JSON response: ${trimmed.slice(0, 100)}…`)
  }
}

function getApiKey(formKey?: string): string | null {
  const key =
    formKey?.trim() ||
    (typeof import.meta !== 'undefined' &&
      (import.meta as unknown as { env?: { VITE_REPLICATE_API_TOKEN?: string } }).env
        ?.VITE_REPLICATE_API_TOKEN)
  return key || null
}

/** Strip LRC timestamps to get plain text for alignment */
function toPlainLyrics(lyrics: string): string {
  return lyrics
    .trim()
    .split(/\r?\n/)
    .map((l) => l.replace(/^\[[\d:.]+\]\s*/, '').trim())
    .filter(Boolean)
    .join('\n')
}

export async function syncLyricsWithAI(
  audioFile: File,
  plainLyrics: string,
  apiKey: string,
  onStatus?: (msg: string) => void
): Promise<string> {
  const key = getApiKey(apiKey)
  if (!key) throw new Error('Replicate API key required for AI lyric sync.')

  onStatus?.('Preparing audio…')
  const arrayBuffer = await audioFile.arrayBuffer()
  const base64 = btoa(
    new Uint8Array(arrayBuffer).reduce((s, b) => s + String.fromCharCode(b), '')
  )
  const mime = audioFile.type || 'audio/mpeg'
  const dataUrl = `data:${mime};base64,${base64}`

  if (dataUrl.length > 25_000_000) {
    throw new Error('Audio file too large for AI sync (max ~18MB). Try a shorter clip.')
  }

  onStatus?.('Sending to Whisper AI…')
  const res = await fetch(`${REPLICATE_API}/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: WHISPER_VERSION,
      input: {
        audio_file: dataUrl,
        language: 'auto',
        initial_prompt: toPlainLyrics(plainLyrics).slice(0, 200),
        task: 'transcribe',
      },
    }),
  })

  const repBody = (await parseJsonResponse(res)) as { id?: string; urls?: { get: string }; detail?: string; error?: string }
  if (!res.ok) {
    const err = (repBody && typeof repBody === 'object' && ('detail' in repBody ? repBody.detail : 'error' in repBody ? repBody.error : null)) || 'Unknown error'
    throw new Error(`Replicate error: ${err}`)
  }

  const getUrl = repBody.urls?.get
  if (!getUrl) throw new Error('Unexpected Replicate response')

  for (let i = 0; i < 180; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    onStatus?.(`Transcribing… (${i + 1})`)
    const statusRes = await fetch(getUrl, {
      headers: { Authorization: `Bearer ${key}` },
    })
    const status = (await parseJsonResponse(statusRes)) as {
      status: string
      output?: unknown
    }
    if (status.status === 'succeeded') {
      onStatus?.('Aligning lyrics…')
      return alignLyricsToTranscript(plainLyrics, status.output)
    }
    if (status.status === 'failed' || status.status === 'canceled') {
      throw new Error(`Whisper ${status.status}`)
    }
  }
  throw new Error('AI lyric sync timed out')
}

/**
 * Extract lyrics from a local Whisper API server (OpenAI-compatible, e.g. faster-whisper-server).
 * POST to {baseUrl}/v1/audio/transcriptions with multipart form data.
 */
async function extractLyricsFromLocalServer(
  audioFile: File,
  baseUrl: string,
  onStatus?: (msg: string) => void
): Promise<string> {
  const url = baseUrl.replace(/\/$/, '') + '/v1/audio/transcriptions'
  onStatus?.('Sending to local Whisper…')
  const form = new FormData()
  form.append('file', audioFile)
  form.append('model', 'whisper-1')
  form.append('response_format', 'verbose_json')
  const res = await fetch(url, {
    method: 'POST',
    body: form,
  })
  const body = await parseJsonResponse(res)
  if (!res.ok) {
    const err = body && typeof body === 'object' && 'error' in body
      ? (body as { error?: string }).error
      : res.statusText
    throw new Error(`Local Whisper error: ${err ?? res.status}`)
  }
  const data = body as { segments?: Array<{ start?: number; end?: number; text?: string }>; text?: string }
  if (data.segments?.length) {
    return data.segments
      .map((s) => {
        const start = s.start ?? 0
        const min = Math.floor(start / 60)
        const sec = Math.floor(start % 60)
        const cs = Math.floor((start % 1) * 100)
        return `[${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}]${(s.text ?? '').trim()}`
      })
      .join('\n')
  }
  const text = (data.text ?? '').trim()
  return text ? `[00:00.00]${text}` : ''
}

/**
 * Extract lyrics from audio using Replicate (if key), local Whisper server (if URL), or in-browser model as fallback.
 * Works with separate audio file – no lyric file or text needed.
 */
export async function extractLyricsFromAudioAuto(
  audioFile: File,
  options: {
    replicateApiKey?: string
    localWhisperUrl?: string
    onStatus?: (msg: string) => void
  }
): Promise<string> {
  const { replicateApiKey, localWhisperUrl, onStatus } = options
  if (getApiKey(replicateApiKey)) {
    try {
      return await extractLyricsFromAudio(audioFile, replicateApiKey || '', onStatus)
    } catch {
      onStatus?.('Replicate failed, trying local Whisper…')
    }
  }
  const localUrl = localWhisperUrl?.trim()
  if (localUrl) {
    try {
      return await extractLyricsFromLocalServer(audioFile, localUrl, onStatus)
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      throw new Error(
        `Local Whisper server failed: ${errMsg}. ` +
        `Ensure your server is running at ${localUrl} and exposes POST /v1/audio/transcriptions (OpenAI-compatible).`
      )
    }
  }
  try {
    return await extractLyricsFromAudioLocal(audioFile, onStatus)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/Unexpected token '<'|<!DOCTYPE|is not valid JSON/i.test(msg)) {
      throw new Error(
        'In-browser Whisper failed (HuggingFace returned HTML). ' +
        'Use a local Whisper server (set URL under Lyrics, e.g. http://127.0.0.1:8002) or add a Replicate API key.'
      )
    }
    throw e
  }
}

/**
 * Extract lyrics from audio using local Whisper Large V3 (no API key needed).
 * Tries local model first (from /models/whisper-large-v3 if npm run download-whisper was run).
 * Falls back to HuggingFace Hub when local fails (e.g. protobuf/ONNX errors from incomplete downloads).
 */
async function extractLyricsFromAudioLocal(
  audioFile: File,
  onStatus?: (msg: string) => void
): Promise<string> {
  const mod = await import('@huggingface/transformers')
  const { pipeline, env } = mod
  if (typeof window !== 'undefined') {
    env.allowLocalModels = true
    env.localModelPath = env.localModelPath || '/models/'
  }

  const loadOptions = { return_timestamps: true as const, chunk_length_s: 30, stride_length_s: 5 }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let transcriber: any
  try {
    onStatus?.('Loading Whisper model…')
    transcriber = await pipeline('automatic-speech-recognition', 'whisper-large-v3', {
      local_files_only: true,
    })
  } catch (localErr) {
    const msg = localErr instanceof Error ? localErr.message : String(localErr)
    const isProtobufOrSession = /protobuf|ERROR_CODE|Failed to load model|CreateSession/i.test(msg)
    if (isProtobufOrSession) {
      onStatus?.('Local model failed (incomplete or missing files). Downloading from HuggingFace…')
    } else {
      throw localErr
    }
    transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-large-v3', {
      local_files_only: false,
      progress_callback: (p: Record<string, unknown>) => {
        const prog = typeof p?.progress === 'number' ? Math.round(p.progress * 100) : null
        onStatus?.(prog != null ? `Downloading model… ${prog}%` : 'Downloading model…')
      },
    })
  }

  const url = URL.createObjectURL(audioFile)
  try {
    onStatus?.('Transcribing…')
    const out = await transcriber(url, loadOptions) as { text?: string; chunks?: Array<{ timestamp: [number, number]; text: string }> }
    if (out.chunks?.length) {
      return out.chunks
        .map((c) => {
          const [start] = c.timestamp
          const min = Math.floor(start / 60)
          const sec = Math.floor(start % 60)
          const cs = Math.floor((start % 1) * 100)
          return `[${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}]${(c.text || '').trim()}`
        })
        .join('\n')
    }
    return (out.text || '').trim() ? `[00:00.00]${(out.text || '').trim()}` : ''
  } finally {
    URL.revokeObjectURL(url)
    transcriber?.dispose?.()
  }
}

/**
 * Extract lyrics from audio using Whisper Large V3 (Replicate API).
 * No lyrics needed – transcribes singing/speech and returns synced LRC.
 */
export async function extractLyricsFromAudio(
  audioFile: File,
  apiKey: string,
  onStatus?: (msg: string) => void
): Promise<string> {
  const key = getApiKey(apiKey)
  if (!key) throw new Error('Replicate API key required. Use Anime conversion Replicate key or set VITE_REPLICATE_API_TOKEN.')

  onStatus?.('Preparing audio…')
  const arrayBuffer = await audioFile.arrayBuffer()
  const base64 = btoa(
    new Uint8Array(arrayBuffer).reduce((s, b) => s + String.fromCharCode(b), '')
  )
  const mime = audioFile.type || 'audio/mpeg'
  const dataUrl = `data:${mime};base64,${base64}`

  if (dataUrl.length > 25_000_000) {
    throw new Error('Audio file too large (max ~18MB). Try a shorter clip.')
  }

  onStatus?.('Transcribing with Whisper Large V3…')
  const res = await fetch(`${REPLICATE_API}/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: WHISPER_VERSION,
      input: {
        audio_file: dataUrl,
        language: 'auto',
        task: 'transcribe',
      },
    }),
  })

  const repBody = (await parseJsonResponse(res)) as { id?: string; urls?: { get: string }; detail?: string; error?: string }
  if (!res.ok) {
    const err = (repBody && typeof repBody === 'object' && ('detail' in repBody ? repBody.detail : 'error' in repBody ? repBody.error : null)) || 'Unknown error'
    throw new Error(`Replicate error: ${err}`)
  }

  const getUrl = repBody.urls?.get
  if (!getUrl) throw new Error('Unexpected Replicate response')

  for (let i = 0; i < 180; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    onStatus?.(`Transcribing… (${i + 1})`)
    const statusRes = await fetch(getUrl, {
      headers: { Authorization: `Bearer ${key}` },
    })
    const status = (await parseJsonResponse(statusRes)) as {
      status: string
      output?: unknown
    }
    if (status.status === 'succeeded') {
      onStatus?.('Converting to synced lyrics…')
      return whisperOutputToLRC(status.output)
    }
    if (status.status === 'failed' || status.status === 'canceled') {
      throw new Error(`Whisper ${status.status}`)
    }
  }
  throw new Error('Extraction timed out')
}

/** Convert Whisper transcript output directly to LRC (no alignment needed). */
function whisperOutputToLRC(output: unknown): string {
  type Segment = { start: number; end: number; text: string }
  const segments: Segment[] = []

  if (output && typeof output === 'object') {
    const o = output as Record<string, unknown>
    if (Array.isArray(o.segments)) {
      for (const s of o.segments as Array<{ start?: number; end?: number; text?: string }>) {
        const text = String(s.text || '').trim()
        if (!text) continue
        segments.push({
          start: (s.start ?? 0) * 1000,
          end: (s.end ?? s.start ?? 0) * 1000,
          text,
        })
      }
    }
  }

  return segments
    .map(({ start, text }) => {
      const min = Math.floor(start / 60000)
      const sec = Math.floor((start % 60000) / 1000)
      const cs = Math.floor((start % 1000) / 10)
      return `[${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}]${text}`
    })
    .join('\n')
}

/** Align plain lyrics to Whisper transcript output. Returns LRC string. */
function alignLyricsToTranscript(plainLyrics: string, output: unknown): string {
  const userLines = toPlainLyrics(plainLyrics)
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (!userLines.length) return plainLyrics

  type Segment = { start: number; end: number; text: string }
  let segments: Segment[] = []

  if (output && typeof output === 'object') {
    const o = output as Record<string, unknown>
    if (Array.isArray(o.segments)) {
      segments = (o.segments as Array<{ start?: number; end?: number; text?: string }>)
        .filter((s) => s.text)
        .map((s) => ({
          start: (s.start ?? 0) * 1000,
          end: (s.end ?? s.start ?? 0) * 1000,
          text: String(s.text || '').trim(),
        }))
    } else if (Array.isArray(o.words)) {
      const words = o.words as Array<{ word?: string; start?: number; end?: number }>
      let i = 0
      while (i < words.length) {
        const w = words[i]
        segments.push({
          start: (w.start ?? 0) * 1000,
          end: (w.end ?? w.start ?? 0) * 1000,
          text: String(w.word || '').trim(),
        })
        i++
      }
    }
  }

  if (!segments.length) return plainLyrics

  const lrcLines: string[] = []
  let segIdx = 0
  const userWords = userLines.map((l) => l.toLowerCase().split(/\s+/).filter(Boolean))

  for (let i = 0; i < userLines.length; i++) {
    const line = userLines[i]
    const words = userWords[i]
    if (!words.length) {
      lrcLines.push(`[00:00.00]${line}`)
      continue
    }

    let bestSeg = -1
    let bestScore = 0
    for (let s = segIdx; s < Math.min(segIdx + 20, segments.length); s++) {
      const segText = segments[s].text.toLowerCase()
      let matches = 0
      for (const w of words) {
        if (segText.includes(w) || segText.split(/\s+/).some((sw) => sw.startsWith(w) || w.startsWith(sw))) {
          matches++
        }
      }
      const score = matches / words.length
      if (score > bestScore) {
        bestScore = score
        bestSeg = s
      }
    }

    const timeMs = bestSeg >= 0 ? segments[bestSeg].start : (i / userLines.length) * (segments[segments.length - 1]?.end ?? 0)
    if (bestSeg >= 0) segIdx = bestSeg + 1
    const min = Math.floor(timeMs / 60000)
    const sec = Math.floor((timeMs % 60000) / 1000)
    const cs = Math.floor((timeMs % 1000) / 10)
    lrcLines.push(`[${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}]${line}`)
  }

  return lrcLines.join('\n')
}
