/**
 * Five selectable overlay styles for the music video card.
 * Each theme defines colors for card, volume bar, lyrics box, and text.
 */

export type VideoStyleId =
  | 'fresh'
  | 'royal'
  | 'ocean'
  | 'sunset'
  | 'dark'
  | 'rose'
  | 'mint'
  | 'amber'
  | 'coral'
  | 'midnight'

export interface VideoStyleTheme {
  id: VideoStyleId
  name: string
  cardGradientStops: [number, string][]
  cardStroke: string
  volumeBg: string
  volumeFill: string
  volumeStroke: string
  lyricBoxBg: string
  lyricBoxStroke: string
  titleColor: string
  subtitleColor: string
  artistColor: string
  lyricTextColor: string
  artGlowColor: string
  /** Font family for title (canvas font string) */
  titleFont: string
  /** Font family for subtitle/album */
  subtitleFont: string
  /** Font family for artist */
  artistFont: string
  /** Font for lyrics */
  lyricFont: string
  /** Font weight for title: 600, 700, 800, 900 */
  titleWeight: string
  /** Font style: normal | italic */
  titleStyle: string
  /** Font weight for artist/subtitle */
  bodyWeight: string
  bodyStyle: string
}

export const VIDEO_STYLES: VideoStyleTheme[] = [
  {
    id: 'fresh',
    name: 'Fresh Green',
    cardGradientStops: [
      [0, 'rgba(160,245,195,0.98)'],
      [0.25, 'rgba(187,255,215,0.97)'],
      [0.5, 'rgba(220,255,235,0.96)'],
      [0.75, 'rgba(240,255,248,0.95)'],
      [1, 'rgba(248,255,250,0.96)'],
    ],
    cardStroke: 'rgba(34,197,94,0.7)',
    volumeBg: 'rgba(20,35,25,0.9)',
    volumeFill: '#22c55e',
    volumeStroke: 'rgba(34,197,94,0.55)',
    lyricBoxBg: 'rgba(18,35,25,0.9)',
    lyricBoxStroke: 'rgba(34,197,94,0.45)',
    titleColor: 'rgba(28,100,55,',
    subtitleColor: 'rgba(18,18,28,',
    artistColor: 'rgba(12,12,18,',
    lyricTextColor: 'rgba(255,255,255,0.95)',
    artGlowColor: '34,197,94',
    titleFont: 'Outfit, system-ui, sans-serif',
    subtitleFont: 'Outfit, system-ui, sans-serif',
    artistFont: 'Outfit, system-ui, sans-serif',
    lyricFont: 'Outfit, system-ui, sans-serif',
    titleWeight: '700',
    titleStyle: 'normal',
    bodyWeight: '600',
    bodyStyle: 'normal',
  },
  {
    id: 'royal',
    name: 'Royal Purple',
    cardGradientStops: [
      [0, 'rgba(196,181,253,0.98)'],
      [0.25, 'rgba(216,205,255,0.97)'],
      [0.5, 'rgba(233,225,255,0.96)'],
      [0.75, 'rgba(245,240,255,0.95)'],
      [1, 'rgba(250,248,255,0.96)'],
    ],
    cardStroke: 'rgba(139,92,246,0.7)',
    volumeBg: 'rgba(30,25,50,0.9)',
    volumeFill: '#8b5cf6',
    volumeStroke: 'rgba(139,92,246,0.55)',
    lyricBoxBg: 'rgba(25,18,45,0.9)',
    lyricBoxStroke: 'rgba(139,92,246,0.45)',
    titleColor: 'rgba(76,29,149,',
    subtitleColor: 'rgba(20,18,35,',
    artistColor: 'rgba(15,12,28,',
    lyricTextColor: 'rgba(255,255,255,0.95)',
    artGlowColor: '139,92,246',
    titleFont: 'Playfair Display, Georgia, serif',
    subtitleFont: 'Outfit, system-ui, sans-serif',
    artistFont: 'Outfit, system-ui, sans-serif',
    lyricFont: 'Outfit, system-ui, sans-serif',
    titleWeight: '700',
    titleStyle: 'italic',
    bodyWeight: '600',
    bodyStyle: 'normal',
  },
  {
    id: 'ocean',
    name: 'Ocean Blue',
    titleFont: 'Outfit, system-ui, sans-serif',
    subtitleFont: 'Outfit, system-ui, sans-serif',
    artistFont: 'Outfit, system-ui, sans-serif',
    lyricFont: 'Outfit, system-ui, sans-serif',
    titleWeight: '800',
    titleStyle: 'normal',
    bodyWeight: '600',
    bodyStyle: 'normal',
    cardGradientStops: [
      [0, 'rgba(165,216,255,0.98)'],
      [0.25, 'rgba(195,235,255,0.97)'],
      [0.5, 'rgba(220,245,255,0.96)'],
      [0.75, 'rgba(238,250,255,0.95)'],
      [1, 'rgba(248,252,255,0.96)'],
    ],
    cardStroke: 'rgba(59,130,246,0.7)',
    volumeBg: 'rgba(15,35,55,0.9)',
    volumeFill: '#3b82f6',
    volumeStroke: 'rgba(59,130,246,0.55)',
    lyricBoxBg: 'rgba(15,35,55,0.9)',
    lyricBoxStroke: 'rgba(59,130,246,0.45)',
    titleColor: 'rgba(30,64,175,',
    subtitleColor: 'rgba(18,20,35,',
    artistColor: 'rgba(12,15,28,',
    lyricTextColor: 'rgba(255,255,255,0.95)',
    artGlowColor: '59,130,246',
  },
  {
    id: 'sunset',
    name: 'Sunset',
    titleFont: 'Outfit, system-ui, sans-serif',
    subtitleFont: 'Outfit, system-ui, sans-serif',
    artistFont: 'Outfit, system-ui, sans-serif',
    lyricFont: 'Outfit, system-ui, sans-serif',
    titleWeight: '700',
    titleStyle: 'normal',
    bodyWeight: '600',
    bodyStyle: 'normal',
    cardGradientStops: [
      [0, 'rgba(254,215,170,0.98)'],
      [0.25, 'rgba(255,235,210,0.97)'],
      [0.5, 'rgba(255,245,230,0.96)'],
      [0.75, 'rgba(255,250,240,0.95)'],
      [1, 'rgba(255,252,248,0.96)'],
    ],
    cardStroke: 'rgba(249,115,22,0.7)',
    volumeBg: 'rgba(45,30,20,0.9)',
    volumeFill: '#f97316',
    volumeStroke: 'rgba(249,115,22,0.55)',
    lyricBoxBg: 'rgba(45,25,15,0.9)',
    lyricBoxStroke: 'rgba(249,115,22,0.45)',
    titleColor: 'rgba(154,52,18,',
    subtitleColor: 'rgba(28,18,12,',
    artistColor: 'rgba(20,12,8,',
    lyricTextColor: 'rgba(255,255,255,0.95)',
    artGlowColor: '249,115,22',
  },
  {
    id: 'dark',
    name: 'Dark',
    cardGradientStops: [
      [0, 'rgba(30,41,59,0.98)'],
      [0.25, 'rgba(51,65,85,0.97)'],
      [0.5, 'rgba(71,85,105,0.96)'],
      [0.75, 'rgba(100,116,139,0.95)'],
      [1, 'rgba(148,163,184,0.94)'],
    ],
    cardStroke: 'rgba(148,163,184,0.65)',
    volumeBg: 'rgba(15,15,20,0.95)',
    volumeFill: '#94a3b8',
    volumeStroke: 'rgba(148,163,184,0.5)',
    lyricBoxBg: 'rgba(15,15,22,0.92)',
    lyricBoxStroke: 'rgba(148,163,184,0.4)',
    titleColor: 'rgba(226,232,240,',
    subtitleColor: 'rgba(203,213,225,',
    artistColor: 'rgba(148,163,184,',
    lyricTextColor: 'rgba(241,245,249,0.95)',
    artGlowColor: '148,163,184',
    titleFont: 'Outfit, system-ui, sans-serif',
    subtitleFont: 'Outfit, system-ui, sans-serif',
    artistFont: 'Outfit, system-ui, sans-serif',
    lyricFont: 'Outfit, system-ui, sans-serif',
    titleWeight: '700',
    titleStyle: 'normal',
    bodyWeight: '600',
    bodyStyle: 'normal',
  },
  {
    id: 'rose',
    name: 'Rose',
    cardGradientStops: [
      [0, 'rgba(254,205,211,0.98)'],
      [0.25, 'rgba(255,228,230,0.97)'],
      [0.5, 'rgba(255,240,245,0.96)'],
      [0.75, 'rgba(255,248,250,0.95)'],
      [1, 'rgba(255,250,252,0.96)'],
    ],
    cardStroke: 'rgba(244,63,94,0.7)',
    volumeBg: 'rgba(45,25,35,0.9)',
    volumeFill: '#f43f5e',
    volumeStroke: 'rgba(244,63,94,0.55)',
    lyricBoxBg: 'rgba(40,20,30,0.9)',
    lyricBoxStroke: 'rgba(244,63,94,0.45)',
    titleColor: 'rgba(190,18,60,',
    subtitleColor: 'rgba(30,18,22,',
    artistColor: 'rgba(20,12,18,',
    lyricTextColor: 'rgba(255,255,255,0.95)',
    artGlowColor: '244,63,94',
    titleFont: 'Outfit, system-ui, sans-serif',
    subtitleFont: 'Outfit, system-ui, sans-serif',
    artistFont: 'Outfit, system-ui, sans-serif',
    lyricFont: 'Outfit, system-ui, sans-serif',
    titleWeight: '700',
    titleStyle: 'italic',
    bodyWeight: '600',
    bodyStyle: 'normal',
  },
  {
    id: 'mint',
    name: 'Mint',
    cardGradientStops: [
      [0, 'rgba(204,251,241,0.98)'],
      [0.25, 'rgba(230,255,250,0.97)'],
      [0.5, 'rgba(240,255,252,0.96)'],
      [0.75, 'rgba(248,255,253,0.95)'],
      [1, 'rgba(250,255,254,0.96)'],
    ],
    cardStroke: 'rgba(20,184,166,0.7)',
    volumeBg: 'rgba(15,35,35,0.9)',
    volumeFill: '#14b8a6',
    volumeStroke: 'rgba(20,184,166,0.55)',
    lyricBoxBg: 'rgba(12,40,38,0.9)',
    lyricBoxStroke: 'rgba(20,184,166,0.45)',
    titleColor: 'rgba(13,148,136,',
    subtitleColor: 'rgba(18,25,28,',
    artistColor: 'rgba(12,18,20,',
    lyricTextColor: 'rgba(255,255,255,0.95)',
    artGlowColor: '20,184,166',
    titleFont: 'Outfit, system-ui, sans-serif',
    subtitleFont: 'Outfit, system-ui, sans-serif',
    artistFont: 'Outfit, system-ui, sans-serif',
    lyricFont: 'Outfit, system-ui, sans-serif',
    titleWeight: '700',
    titleStyle: 'normal',
    bodyWeight: '600',
    bodyStyle: 'normal',
  },
  {
    id: 'amber',
    name: 'Amber',
    cardGradientStops: [
      [0, 'rgba(254,243,199,0.98)'],
      [0.25, 'rgba(255,248,220,0.97)'],
      [0.5, 'rgba(255,251,235,0.96)'],
      [0.75, 'rgba(255,253,245,0.95)'],
      [1, 'rgba(255,254,250,0.96)'],
    ],
    cardStroke: 'rgba(245,158,11,0.7)',
    volumeBg: 'rgba(45,35,15,0.9)',
    volumeFill: '#f59e0b',
    volumeStroke: 'rgba(245,158,11,0.55)',
    lyricBoxBg: 'rgba(40,30,10,0.9)',
    lyricBoxStroke: 'rgba(245,158,11,0.45)',
    titleColor: 'rgba(180,83,9,',
    subtitleColor: 'rgba(28,22,12,',
    artistColor: 'rgba(20,15,8,',
    lyricTextColor: 'rgba(255,255,255,0.95)',
    artGlowColor: '245,158,11',
    titleFont: 'Outfit, system-ui, sans-serif',
    subtitleFont: 'Outfit, system-ui, sans-serif',
    artistFont: 'Outfit, system-ui, sans-serif',
    lyricFont: 'Outfit, system-ui, sans-serif',
    titleWeight: '800',
    titleStyle: 'normal',
    bodyWeight: '600',
    bodyStyle: 'normal',
  },
  {
    id: 'coral',
    name: 'Coral',
    cardGradientStops: [
      [0, 'rgba(255,218,214,0.98)'],
      [0.25, 'rgba(255,235,230,0.97)'],
      [0.5, 'rgba(255,245,240,0.96)'],
      [0.75, 'rgba(255,250,247,0.95)'],
      [1, 'rgba(255,252,250,0.96)'],
    ],
    cardStroke: 'rgba(251,113,133,0.7)',
    volumeBg: 'rgba(50,25,30,0.9)',
    volumeFill: '#fb7185',
    volumeStroke: 'rgba(251,113,133,0.55)',
    lyricBoxBg: 'rgba(45,22,28,0.9)',
    lyricBoxStroke: 'rgba(251,113,133,0.45)',
    titleColor: 'rgba(190,18,60,',
    subtitleColor: 'rgba(28,18,22,',
    artistColor: 'rgba(22,12,16,',
    lyricTextColor: 'rgba(255,255,255,0.95)',
    artGlowColor: '251,113,133',
    titleFont: 'Outfit, system-ui, sans-serif',
    subtitleFont: 'Outfit, system-ui, sans-serif',
    artistFont: 'Outfit, system-ui, sans-serif',
    lyricFont: 'Outfit, system-ui, sans-serif',
    titleWeight: '700',
    titleStyle: 'normal',
    bodyWeight: '600',
    bodyStyle: 'normal',
  },
  {
    id: 'midnight',
    name: 'Midnight',
    cardGradientStops: [
      [0, 'rgba(30,27,75,0.98)'],
      [0.25, 'rgba(49,46,129,0.97)'],
      [0.5, 'rgba(67,56,202,0.96)'],
      [0.75, 'rgba(99,102,241,0.95)'],
      [1, 'rgba(129,140,248,0.94)'],
    ],
    cardStroke: 'rgba(129,140,248,0.75)',
    volumeBg: 'rgba(15,15,35,0.95)',
    volumeFill: '#818cf8',
    volumeStroke: 'rgba(129,140,248,0.55)',
    lyricBoxBg: 'rgba(12,12,35,0.92)',
    lyricBoxStroke: 'rgba(129,140,248,0.5)',
    titleColor: 'rgba(199,210,254,',
    subtitleColor: 'rgba(165,180,252,',
    artistColor: 'rgba(129,140,248,',
    lyricTextColor: 'rgba(255,255,255,0.95)',
    artGlowColor: '129,140,248',
    titleFont: 'Outfit, system-ui, sans-serif',
    subtitleFont: 'Outfit, system-ui, sans-serif',
    artistFont: 'Outfit, system-ui, sans-serif',
    lyricFont: 'Outfit, system-ui, sans-serif',
    titleWeight: '700',
    titleStyle: 'normal',
    bodyWeight: '600',
    bodyStyle: 'normal',
  },
]

const FONT_DEFAULTS = {
  titleFont: 'Outfit, system-ui, sans-serif',
  subtitleFont: 'Outfit, system-ui, sans-serif',
  artistFont: 'Outfit, system-ui, sans-serif',
  lyricFont: 'Outfit, system-ui, sans-serif',
  titleWeight: '700',
  titleStyle: 'normal',
  bodyWeight: '600',
  bodyStyle: 'normal',
} as const

export function getVideoStyleTheme(id: VideoStyleId): VideoStyleTheme {
  const s = VIDEO_STYLES.find((x) => x.id === id) ?? VIDEO_STYLES[0]
  return { ...FONT_DEFAULTS, ...s } as VideoStyleTheme
}
