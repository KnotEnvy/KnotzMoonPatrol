// Small collision meshes use the same analytic brush on CPU: queueing behind a
// rendered GPU frame costs more than processing their few hundred vertices.
// Larger jobs retain WGSL/readback; Terrain commits every mesh/collider together.
export const CPU_BRUSH_VERTEX_LIMIT = 2048;
export type BrushBackend = 'auto' | 'cpu' | 'gpu';

export function carveCPU(
  vertices: Float32Array,
  x: number,
  y: number,
  radius: number,
  depth: number,
) {
  let result = vertices;
  const radius2 = radius * radius;
  for (let i = 0; i < vertices.length; i += 3) {
    const dx = vertices[i] - x,
      z = vertices[i + 2],
      distance2 = dx * dx + z * z;
    if (distance2 >= radius2) continue;
    const height = Math.fround(y - Math.sqrt(Math.max(0, 1 - distance2 / radius2)) * depth);
    if (height >= vertices[i + 1]) continue;
    if (result === vertices) result = vertices.slice();
    result[i + 1] = height;
  }
  return result;
}
export const CARVE_WGSL = `
struct Brush { center: vec4f, shape: vec4f };
@group(0) @binding(0) var<storage, read_write> points: array<vec4f>;
@group(0) @binding(1) var<uniform> brush: Brush;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
 if (id.x >= arrayLength(&points)) { return; }
 let p = points[id.x];
 let d = distance(p.xz, brush.center.xz);
 let r = brush.shape.x;
 if (d < r) {
  let depth = sqrt(max(0.0, 1.0 - d * d / (r * r))) * brush.shape.y;
  points[id.x].y = min(p.y, brush.center.y - depth);
 }
}`;
export class TerrainCompute {
  lastBackend: 'cpu' | 'gpu' = 'cpu';
  private device?: GPUDevice;
  private pipeline?: GPUComputePipeline;
  private ownsDevice = false;
  async init(sharedDevice?: GPUDevice) {
    try {
      if (sharedDevice) this.device = sharedDevice;
      else {
        const gpu = navigator.gpu;
        if (!gpu) return;
        const adapter = await gpu.requestAdapter();
        if (!adapter) return;
        this.device = await adapter.requestDevice();
        this.ownsDevice = true;
      }
      this.pipeline = await this.device.createComputePipelineAsync({
        layout: 'auto',
        compute: {
          module: this.device.createShaderModule({ code: CARVE_WGSL }),
          entryPoint: 'main',
        },
      });
      await this.carve(new Float32Array([0, 0, 0]), 0, 0, 1, 1, 'gpu');
      void this.device?.lost.then(() => {
        this.device = undefined;
        this.pipeline = undefined;
      });
    } catch {
      if (this.ownsDevice) this.device?.destroy();
      this.device = undefined;
    }
  }
  get available() {
    return !!this.device && !!this.pipeline;
  }
  async carve(
    vertices: Float32Array,
    x: number,
    y: number,
    radius: number,
    depth: number,
    backend: BrushBackend = 'auto',
  ): Promise<Float32Array> {
    if (![x, y, radius, depth].every(Number.isFinite) || radius <= 0 || depth <= 0) return vertices;
    if (
      backend === 'cpu' ||
      (backend === 'auto' && vertices.length / 3 <= CPU_BRUSH_VERTEX_LIMIT) ||
      !this.available
    ) {
      this.lastBackend = 'cpu';
      return carveCPU(vertices, x, y, radius, depth);
    }
    return this.carveGPU(vertices, x, y, radius, depth);
  }
  private async carveGPU(
    vertices: Float32Array,
    x: number,
    y: number,
    radius: number,
    depth: number,
  ): Promise<Float32Array> {
    this.lastBackend = 'gpu';
    const result = vertices.slice();
    const device = this.device!,
      pipeline = this.pipeline!,
      padded = new Float32Array((vertices.length / 3) * 4);
    for (let i = 0; i < vertices.length / 3; i++)
      padded.set(vertices.subarray(i * 3, i * 3 + 3), i * 4);
    let data: GPUBuffer | undefined, params: GPUBuffer | undefined, read: GPUBuffer | undefined;
    try {
      data = device.createBuffer({
        size: padded.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      });
      params = device.createBuffer({
        size: 32,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      read = device.createBuffer({
        size: padded.byteLength,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(data, 0, padded);
      device.queue.writeBuffer(params, 0, new Float32Array([x, y, 0, 0, radius, depth, 0, 0]));
      const bind = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: data } },
          { binding: 1, resource: { buffer: params } },
        ],
      });
      const encoder = device.createCommandEncoder(),
        pass = encoder.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bind);
      pass.dispatchWorkgroups(Math.ceil(padded.length / 4 / 64));
      pass.end();
      encoder.copyBufferToBuffer(data, 0, read, 0, padded.byteLength);
      device.queue.submit([encoder.finish()]);
      await read.mapAsync(GPUMapMode.READ);
      const out = new Float32Array(read.getMappedRange());
      for (let i = 0; i < result.length / 3; i++) result.set(out.subarray(i * 4, i * 4 + 3), i * 3);
      read.unmap();
      return result;
    } catch {
      if (this.ownsDevice) device.destroy();
      // Do not destroy the renderer's shared device when falling back.
      this.device = undefined;
      this.pipeline = undefined;
      this.lastBackend = 'cpu';
      return carveCPU(vertices, x, y, radius, depth);
    } finally {
      data?.destroy();
      params?.destroy();
      read?.destroy();
    }
  }
  dispose() {
    if (this.ownsDevice) this.device?.destroy();
    this.device = undefined;
    this.pipeline = undefined;
  }
}
