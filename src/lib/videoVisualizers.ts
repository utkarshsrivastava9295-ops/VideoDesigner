/**
 * Selectable audio visualizers for the music video card (waveforms, bars, circular, etc.).
 * Grouped into Linear and Circular for the UI.
 */

export type VisualizerGroup = 'linear' | 'circular'

export type VisualizerId =
  | 'waveform'
  | 'bars'
  | 'filledArea'
  | 'barWave'
  | 'rainbowBars'
  | 'glowBars'
  | 'wave'
  | 'waveMirror'
  | 'mountain'
  | 'particles'
  | 'circular'
  | 'sunburst'
  | 'ripple'
  | 'radial'
  | 'circleDots'
  | 'rings'
  | 'arcBars'
  | 'pulse'
  | 'orbitRings'
  | 'spiral'
  | 'vortex'
  | 'neonRing'
  | 'crystalOrb'

export interface VideoVisualizer {
  id: VisualizerId
  name: string
  group: VisualizerGroup
}

export const VIDEO_VISUALIZERS: VideoVisualizer[] = [
  // Linear
  { id: 'waveform', name: 'Waveform', group: 'linear' },
  { id: 'bars', name: 'Audio Bars', group: 'linear' },
  { id: 'filledArea', name: 'Filled Wave', group: 'linear' },
  { id: 'barWave', name: 'Bar Wave', group: 'linear' },
  { id: 'rainbowBars', name: 'Rainbow Bars', group: 'linear' },
  { id: 'glowBars', name: 'Glow Bars', group: 'linear' },
  { id: 'wave', name: 'Wave', group: 'linear' },
  { id: 'waveMirror', name: 'Mirror Wave', group: 'linear' },
  { id: 'mountain', name: 'Mountain', group: 'linear' },
  { id: 'particles', name: 'Particles', group: 'linear' },
  // Circular
  { id: 'circular', name: 'Circular', group: 'circular' },
  { id: 'sunburst', name: 'Sunburst', group: 'circular' },
  { id: 'ripple', name: 'Ripple', group: 'circular' },
  { id: 'radial', name: 'Radial', group: 'circular' },
  { id: 'circleDots', name: 'Circle Dots', group: 'circular' },
  { id: 'rings', name: 'Rings', group: 'circular' },
  { id: 'arcBars', name: 'Arc Bars', group: 'circular' },
  { id: 'pulse', name: 'Pulse', group: 'circular' },
  { id: 'orbitRings', name: 'Orbit Rings', group: 'circular' },
  { id: 'spiral', name: 'Spiral', group: 'circular' },
  { id: 'vortex', name: 'Vortex', group: 'circular' },
  { id: 'neonRing', name: 'Neon Ring', group: 'circular' },
  { id: 'crystalOrb', name: 'Crystal Orb', group: 'circular' },
]

export function getVisualizer(id: VisualizerId): VideoVisualizer {
  return VIDEO_VISUALIZERS.find((v) => v.id === id) ?? VIDEO_VISUALIZERS[0]
}
