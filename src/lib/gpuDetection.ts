/**
 * GPU availability detection for display in UI.
 * WebCodecs VideoEncoder may use hardware acceleration when prefer-hardware is set,
 * but the browser does not expose whether it's actually using GPU at runtime.
 */

let gpuCheckPromise: Promise<{ available: boolean; info: string }> | null = null

export async function checkGpuAvailable(): Promise<{ available: boolean; info: string }> {
  if (gpuCheckPromise) return gpuCheckPromise
  gpuCheckPromise = (async () => {
    try {
      const gpu = (navigator as { gpu?: { requestAdapter?: () => Promise<{ info?: unknown } | null> } }).gpu
      if (!gpu?.requestAdapter) {
        return { available: false, info: 'WebGPU not available (use Chrome/Edge for GPU)' }
      }
      const adapter = await gpu.requestAdapter()
      if (!adapter) {
        return { available: false, info: 'No GPU adapter found' }
      }
      return { available: true, info: 'GPU detected (WebCodecs may use hardware encoding)' }
    } catch {
      return { available: false, info: 'GPU check failed' }
    }
  })()
  return gpuCheckPromise
}
