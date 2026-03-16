/**
 * 10 selectable 3D-style particle effects – rendered in a separate layer
 * with depth, perspective, and graphical polish.
 */

export type ParticleEffectId =
  | 'none'
  | 'spheres'
  | 'confetti3d'
  | 'hearts3d'
  | 'stars3d'
  | 'sparkle3d'
  | 'floatingOrbs'
  | 'auroraDust'
  | 'crystalShards'
  | 'goldenMotes'
  | 'cosmicDrift'

export interface VideoParticleEffect {
  id: ParticleEffectId
  name: string
  description: string
}

export const PARTICLE_EFFECTS: VideoParticleEffect[] = [
  { id: 'none', name: 'None', description: 'No particles' },
  { id: 'spheres', name: 'Spheres', description: '3D floating spheres with depth' },
  { id: 'confetti3d', name: 'Confetti', description: '3D confetti with perspective' },
  { id: 'hearts3d', name: 'Hearts', description: 'Floating 3D hearts' },
  { id: 'stars3d', name: 'Stars', description: 'Twinkling 3D stars' },
  { id: 'sparkle3d', name: 'Sparkles', description: 'Shimmering sparkle field' },
  { id: 'floatingOrbs', name: 'Floating Orbs', description: 'Glowing orbs with depth' },
  { id: 'auroraDust', name: 'Aurora Dust', description: 'Northern lights particle field' },
  { id: 'crystalShards', name: 'Crystal Shards', description: 'Crystalline floating shards' },
  { id: 'goldenMotes', name: 'Golden Motes', description: 'Golden dust particles' },
  { id: 'cosmicDrift', name: 'Cosmic Drift', description: 'Space-like particle drift' },
]

export function getParticleEffect(id: ParticleEffectId): VideoParticleEffect {
  return PARTICLE_EFFECTS.find((e) => e.id === id) ?? PARTICLE_EFFECTS[0]
}
