export type GraphicsQuality = 'performance' | 'balanced' | 'cinematic';

export const GRAPHICS_PRESETS = {
  performance: {
    label: 'Performance',
    detail: 'Crisp surfaces · lighter rendering',
    pixelRatio: 1,
    shadows: false,
    bloom: false,
  },
  balanced: {
    label: 'Balanced',
    detail: 'Detailed surfaces · dynamic shadows',
    pixelRatio: 1.25,
    shadows: true,
    bloom: false,
  },
  cinematic: {
    label: 'Cinematic',
    detail: 'Luminous effects · richer highlights',
    pixelRatio: 1.75,
    shadows: true,
    bloom: true,
  },
} as const;

export function isGraphicsQuality(value: unknown): value is GraphicsQuality {
  return value === 'performance' || value === 'balanced' || value === 'cinematic';
}

export function graphicsOptions(quality: GraphicsQuality, webgpu: boolean, deviceRatio: number) {
  const preset = GRAPHICS_PRESETS[quality];
  const ratio = Number.isFinite(deviceRatio) && deviceRatio > 0 ? deviceRatio : 1;
  return {
    pixelRatio: Math.min(ratio, preset.pixelRatio),
    shadows: webgpu && preset.shadows,
    bloom: webgpu && preset.bloom,
  };
}

export function loadGraphicsQuality(): GraphicsQuality {
  const requested = new URLSearchParams(location.search).get('quality');
  if (isGraphicsQuality(requested)) return requested;
  try {
    const saved = localStorage.getItem('void-runner-graphics');
    if (isGraphicsQuality(saved)) return saved;
  } catch {
    /* Private/storage-restricted browsers can still play. */
  }
  return 'balanced';
}
