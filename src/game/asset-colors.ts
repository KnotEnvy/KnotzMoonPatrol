import * as T from 'three/webgpu';

/** Compact exports store RGB; WebGPU vertex strides must be multiples of four
 * bytes. Add opaque alpha on upload instead of wasting space in the asset.
 */
export function bakedColorAttribute(rgb: ArrayLike<number>) {
  if (rgb.length % 3) throw new RangeError('Baked colors must contain RGB triples');
  const rgba = new Uint8Array((rgb.length / 3) * 4);
  for (let source = 0, target = 0; source < rgb.length; source += 3, target += 4) {
    rgba[target] = rgb[source];
    rgba[target + 1] = rgb[source + 1];
    rgba[target + 2] = rgb[source + 2];
    rgba[target + 3] = 255;
  }
  return new T.BufferAttribute(rgba, 4, true);
}
