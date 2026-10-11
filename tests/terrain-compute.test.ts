import { afterEach, describe, expect, it, vi } from 'vitest';
import { carveCPU, CPU_BRUSH_VERTEX_LIMIT, TerrainCompute } from '../src/game/terrain-compute';
afterEach(() => vi.unstubAllGlobals());

describe('bounded terrain brushes', () => {
  it('keeps small collider jobs off the GPU even when a compute pipeline is available', async () => {
    const compute = new TerrainCompute();
    Object.assign(compute, { device: {}, pipeline: {} });
    const gpu = vi.spyOn(compute as unknown as { carveGPU: TerrainCompute['carve'] }, 'carveGPU');
    const boundary = new Float32Array(CPU_BRUSH_VERTEX_LIMIT * 3);
    const result = await compute.carve(boundary, 0, 0, 5, 4);
    expect(compute.available).toBe(true);
    expect(compute.lastBackend).toBe('cpu');
    expect(result[1]).toBe(-4);
    expect(boundary[1]).toBe(0);
    expect(gpu).not.toHaveBeenCalled();
    gpu.mockResolvedValue(boundary);
    await compute.carve(new Float32Array((CPU_BRUSH_VERTEX_LIMIT + 1) * 3), 0, 0, 5, 4);
    expect(gpu).toHaveBeenCalledOnce();
    await compute.carve(boundary, 0, 0, 5, 4, 'gpu');
    expect(gpu).toHaveBeenCalledTimes(2);
  });

  it('preserves the bowl profile, untouched coordinates, and idempotent no-op ownership', () => {
    const vertices = new Float32Array([-5, 0, 0, 0, 0, 0, 3, 0, 4, 3, 0, 0]);
    const result = carveCPU(vertices, 0, 0, 5, 4);
    expect([...result]).toEqual([-5, 0, 0, 0, -4, 0, 3, 0, 4, 3, Math.fround(-3.2), 0]);
    expect([...vertices]).toEqual([-5, 0, 0, 0, 0, 0, 3, 0, 4, 3, 0, 0]);
    expect(carveCPU(result, 0, 0, 5, 4)).toBe(result);
    expect(carveCPU(result, 100, 0, 5, 4)).toBe(result);
    expect(carveCPU(result, 0, 4, 5, 4)).toBe(result);
  });

  it('rejects invalid brushes without corrupting vertices', async () => {
    const compute = new TerrainCompute(),
      vertices = new Float32Array([0, 0, 0]);
    for (const [x, y, radius, depth] of [
      [NaN, 0, 5, 4],
      [0, Infinity, 5, 4],
      [0, 0, 0, 4],
      [0, 0, -5, 4],
      [0, 0, 5, -4],
    ])
      expect(await compute.carve(vertices, x, y, radius, depth)).toBe(vertices);
    expect([...vertices]).toEqual([0, 0, 0]);
  });
  it('releases partial GPU allocations and falls back without destroying the shared renderer device', async () => {
    vi.stubGlobal('GPUBufferUsage', {
      STORAGE: 1,
      COPY_DST: 2,
      COPY_SRC: 4,
      UNIFORM: 8,
      MAP_READ: 16,
    });
    const buffer = { destroy: vi.fn() },
      device = {
        createBuffer: vi
          .fn()
          .mockReturnValueOnce(buffer)
          .mockImplementationOnce(() => {
            throw Error('allocation failed');
          }),
        destroy: vi.fn(),
      };
    const compute = new TerrainCompute();
    Object.assign(compute, { device, pipeline: {} });
    const vertices = new Float32Array([0, 0, 0]);
    expect((await compute.carve(vertices, 0, 0, 5, 4, 'gpu'))[1]).toBe(-4);
    expect(compute.lastBackend).toBe('cpu');
    expect(compute.available).toBe(false);
    expect(buffer.destroy).toHaveBeenCalledOnce();
    expect(device.destroy).not.toHaveBeenCalled();
    expect(vertices[1]).toBe(0);
  });
});
