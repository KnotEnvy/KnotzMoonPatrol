// WGSL brush shares the renderer device when available. Visual vertices and colliders commit together
// only after readback. The synchronous CPU brush is the supported WebGL fallback.
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
      await this.carve(new Float32Array([0, 0, 0]), 0, 0, 1, 1);
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
  ): Promise<Float32Array> {
    const result = vertices.slice();
    if (!this.device || !this.pipeline) {
      for (let i = 0; i < result.length; i += 3) {
        const d = Math.hypot(result[i] - x, result[i + 2]);
        if (d < radius)
          result[i + 1] = Math.min(
            result[i + 1],
            y - Math.sqrt(1 - (d * d) / (radius * radius)) * depth,
          );
      }
      return result;
    }
    const device = this.device,
      padded = new Float32Array((vertices.length / 3) * 4);
    for (let i = 0; i < vertices.length / 3; i++)
      padded.set(vertices.subarray(i * 3, i * 3 + 3), i * 4);
    const data = device.createBuffer({
      size: padded.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
    const params = device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const read = device.createBuffer({
      size: padded.byteLength,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    try {
      device.queue.writeBuffer(data, 0, padded);
      device.queue.writeBuffer(params, 0, new Float32Array([x, y, 0, 0, radius, depth, 0, 0]));
      const bind = device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: data } },
          { binding: 1, resource: { buffer: params } },
        ],
      });
      const encoder = device.createCommandEncoder(),
        pass = encoder.beginComputePass();
      pass.setPipeline(this.pipeline);
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
      this.device = undefined;
      this.pipeline = undefined;
      return this.carve(vertices, x, y, radius, depth);
    } finally {
      data.destroy();
      params.destroy();
      read.destroy();
    }
  }
  dispose() {
    if (this.ownsDevice) this.device?.destroy();
    this.device = undefined;
    this.pipeline = undefined;
  }
}
