/**
 * 10 selectable animated background effects for the video (fire, snow, fog, etc.).
 */

export type BackgroundEffectId =
  | 'none'
  | 'fire'
  | 'snow'
  | 'fog'
  | 'smoke'
  | 'rain'
  | 'leaves'
  | 'sparkles'
  | 'aurora'
  | 'bubbles'
  | 'dust'
  | 'rosePetals'

export interface VideoBackgroundEffect {
  id: BackgroundEffectId
  name: string
}

export const BACKGROUND_EFFECTS: VideoBackgroundEffect[] = [
  { id: 'none', name: 'None' },
  { id: 'fire', name: 'Fire' },
  { id: 'snow', name: 'Snow' },
  { id: 'fog', name: 'Fog' },
  { id: 'smoke', name: 'Smoke' },
  { id: 'rain', name: 'Rain' },
  { id: 'leaves', name: 'Leaves' },
  { id: 'sparkles', name: 'Sparkles' },
  { id: 'aurora', name: 'Aurora' },
  { id: 'bubbles', name: 'Bubbles' },
  { id: 'dust', name: 'Dust' },
  { id: 'rosePetals', name: 'Rose petals' },
]

export function getBackgroundEffect(id: BackgroundEffectId): VideoBackgroundEffect {
  return BACKGROUND_EFFECTS.find((e) => e.id === id) ?? BACKGROUND_EFFECTS[0]
}
