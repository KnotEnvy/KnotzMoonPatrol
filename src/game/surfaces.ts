import * as T from 'three/webgpu';
import { randomAt } from './rules';

interface SurfaceImages {
  color: HTMLCanvasElement;
  height: HTMLCanvasElement;
  glow?: HTMLCanvasElement;
}
const images = new Map<number, SurfaceImages>();
const SIZE = 512;

function canvas() {
  const result = document.createElement('canvas');
  result.width = result.height = SIZE;
  return result;
}

function makeImages(biome: number): SurfaceImages {
  const color = canvas(),
    height = canvas(),
    glow = biome === 2 || biome === 3 || biome === 4 ? canvas() : undefined;
  const c = color.getContext('2d')!,
    h = height.getContext('2d')!,
    e = glow?.getContext('2d');
  const pixels = c.createImageData(SIZE, SIZE),
    relief = h.createImageData(SIZE, SIZE);
  let seed = 7927 + biome * 173;
  const base = [196, 215, 119, 163, 178][biome];
  for (let i = 0; i < pixels.data.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const grain = (seed >>> 24) / 255;
    // Periodic, medium-scale bedding remains coherent across the 18 m UV tile.
    // Fine grain sits below those structures instead of defining the whole surface.
    const x = (((i / 4) % SIZE) / SIZE) * Math.PI * 2,
      y = (Math.floor(i / 4 / SIZE) / SIZE) * Math.PI * 2;
    const bedding = Math.sin(y * 3 + Math.sin(x) * 0.7);
    const erosion = Math.sin(x * 2 + Math.cos(y) * 1.6);
    const structure =
      biome === 0
        ? bedding * 9 + erosion * 5
        : biome === 1
          ? Math.sin(x + y * 2) * 8 + erosion * 3
          : biome === 2
            ? bedding * 6 + erosion * 8
            : biome === 3
              ? Math.sin(x * 2 + Math.sin(y * 2)) * 9 + bedding * 4
              : Math.sin(x * 4) * 2;
    const shade = base + structure + (grain - 0.5) * (biome === 1 ? 14 : 30);
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = shade;
    relief.data[i] = relief.data[i + 1] = relief.data[i + 2] = 110 + structure * 1.4 + grain * 22;
    pixels.data[i + 3] = relief.data[i + 3] = 255;
  }
  c.putImageData(pixels, 0, 0);
  h.putImageData(relief, 0, 0);
  if (e) {
    e.fillStyle = '#000';
    e.fillRect(0, 0, SIZE, SIZE);
  }

  if (biome === 0) {
    // Repeat rim stamps across texture edges so the lunar pattern tiles cleanly.
    for (let i = 0; i < 14; i++) {
      const x = randomAt(i + 90) * SIZE,
        y = randomAt(i + 290) * SIZE,
        r = 10 + randomAt(i + 30) * 29;
      for (const dx of [-SIZE, 0, SIZE])
        for (const dy of [-SIZE, 0, SIZE]) {
          const gradient = c.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
          gradient.addColorStop(0, '#30343e9a');
          gradient.addColorStop(0.65, '#676c7880');
          gradient.addColorStop(0.84, '#f4f0db90');
          gradient.addColorStop(1, '#c3c6ca00');
          c.fillStyle = gradient;
          c.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
          h.fillStyle = '#656565';
          h.beginPath();
          h.ellipse(x + dx, y + dy, r * 0.7, r * 0.7, 0, 0, Math.PI * 2);
          h.fill();
        }
    }
  } else if (biome === 1 || biome === 2 || biome === 3) {
    // Connected fracture networks: large roots split into tapered short forks.
    // Stamp wrapped copies so branches crossing a tile edge remain connected.
    const branch = (
      x: number,
      y: number,
      angle: number,
      reach: number,
      depth: number,
      seed: number,
    ) => {
      const points: [number, number][] = [[x, y]];
      for (let step = 0; step < 5; step++) {
        angle += (randomAt(seed + step * 7) - 0.5) * (biome === 3 ? 0.45 : 0.8);
        x += (Math.cos(angle) * reach) / 5;
        y += (Math.sin(angle) * reach) / 5;
        points.push([x, y]);
      }
      for (const context of [c, h, e]) {
        if (!context) continue;
        context.strokeStyle =
          context === e
            ? biome === 2
              ? '#c96935'
              : '#4b785b'
            : context === h
              ? '#525252'
              : biome === 1
                ? '#a6bbd0'
                : biome === 3
                  ? '#455c4a'
                  : '#3d3530';
        context.lineWidth = (context === e ? 0.8 : context === h ? 1.8 : 1.2) * (0.5 + depth * 0.3);
        context.lineCap = 'round';
        context.lineJoin = 'round';
        for (const ox of [-SIZE, 0, SIZE])
          for (const oy of [-SIZE, 0, SIZE]) {
            context.beginPath();
            context.moveTo(points[0][0] + ox, points[0][1] + oy);
            for (let j = 1; j < points.length; j++) {
              const [px, py] = points[j];
              if (biome === 3 && j < points.length - 1) {
                const next = points[j + 1];
                context.quadraticCurveTo(
                  px + ox,
                  py + oy,
                  (px + next[0]) / 2 + ox,
                  (py + next[1]) / 2 + oy,
                );
              } else context.lineTo(px + ox, py + oy);
            }
            context.stroke();
          }
      }
      if (depth > 0) {
        const fork = points[3];
        branch(
          fork[0],
          fork[1],
          angle + 0.55 + randomAt(seed + 39) * 0.35,
          reach * 0.54,
          depth - 1,
          seed + 117,
        );
        branch(x, y, angle - 0.45 - randomAt(seed + 63) * 0.4, reach * 0.62, depth - 1, seed + 229);
      }
    };
    for (let root = 0; root < 7; root++) {
      const seed = root * 101 + biome * 31;
      branch(
        randomAt(seed) * SIZE,
        randomAt(seed + 13) * SIZE,
        randomAt(seed + 41) * Math.PI * 2,
        70 + randomAt(seed + 17) * 80,
        2,
        seed,
      );
    }
  } else {
    // Alloy panel seams, fasteners, and inset luminous guide strips.
    for (let x = 0; x < SIZE; x += 128)
      for (let y = 0; y < SIZE; y += 128) {
        c.strokeStyle = '#38424a';
        c.lineWidth = 5;
        c.strokeRect(x + 2, y + 2, 124, 124);
        h.strokeStyle = '#444';
        h.lineWidth = 4;
        h.strokeRect(x + 2, y + 2, 124, 124);
        c.strokeStyle = '#d1d7df66';
        c.lineWidth = 1;
        c.strokeRect(x + 6, y + 6, 115, 115);
        for (const [dx, dy] of [
          [12, 12],
          [112, 12],
          [12, 112],
          [112, 112],
        ]) {
          c.fillStyle = '#4a545f';
          c.fillRect(x + dx, y + dy, 3, 3);
        }
        e!.fillStyle = '#e87791';
        e!.fillRect(x + 28, y + 7, 40, 1);
      }
  }
  return { color, height, glow };
}

function texture(image: HTMLCanvasElement, color: boolean) {
  const result = new T.CanvasTexture(image);
  result.wrapS = result.wrapT = T.RepeatWrapping;
  result.colorSpace = color ? T.SRGBColorSpace : T.NoColorSpace;
  result.anisotropy = 4;
  return result;
}

/** Cache five CPU image sets; GPU textures belong to one Terrain material owner. */
export function biomeSurface(biome: number) {
  if (!Number.isInteger(biome) || biome < 0 || biome > 4) throw new RangeError('Unknown biome');
  let source = images.get(biome);
  if (!source) {
    source = makeImages(biome);
    images.set(biome, source);
  }
  return {
    map: texture(source.color, true),
    bumpMap: texture(source.height, false),
    emissiveMap: source.glow ? texture(source.glow, true) : null,
    bumpScale: [0.21, 0.09, 0.18, 0.13, 0.07][biome],
    metalness: [0.1, 0.18, 0.28, 0.06, 0.72][biome],
    roughness: [0.94, 0.28, 0.84, 0.82, 0.46][biome],
    emissive: new T.Color(source.glow ? '#ffffff' : '#000000'),
    emissiveIntensity: [0, 0, 0.55, 0.45, 0.4][biome],
  };
}
