import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { launchBrowser, gameUrl } from './helpers/browser.mjs';
import { assetProvenance } from './helpers/asset-provenance.mjs';

// Neutral-light inspection of the actual runtime models; never a production route.
const stage = process.env.ASSET_STAGE ?? 'current';
const provenance = await assetProvenance();
assert(/^[a-z0-9-]+$/.test(stage));
const directory = 'test-results/asset-pass';
await fs.mkdir(directory, { recursive: true });
const source =
  stage === 'before' ? '/test-results/asset-pass/models-before.ts' : '/src/game/models.ts';
if (stage === 'before') {
  const old = await fs.readFile(`${directory}/models-before.ts`, 'utf8');
  await fs.writeFile(
    `${directory}/models-before.ts`,
    old.replaceAll("from './", "from '/src/game/"),
  );
}
await fs.writeFile(
  `${directory}/studio.html`,
  `<!doctype html><html><head><meta charset="utf-8"><title>Runtime asset inspection</title><style>body{margin:0;background:#101922;overflow:hidden}canvas{display:block}#caption{position:absolute;bottom:28px;left:32px;color:#e8e7df;font:16px monospace;letter-spacing:2px}small{display:block;font-size:11px;color:#9aaebd;margin-top:8px}</style></head><body><div id="caption"></div><script type="module">
import * as T from 'three/webgpu';
import {makeRover,makeEnemy,disposeGroup} from '${source}';
const renderer=new T.WebGPURenderer({antialias:true,forceWebGL:true});
await renderer.init(); renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(1);renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
document.body.prepend(renderer.domElement);
const scene=new T.Scene();scene.background=new T.Color('#101922');
scene.add(new T.HemisphereLight('#d5e7ff','#48413b',2));
for(const [color,intensity,x,y,z] of [['#fff0dc',4,5,9,7],['#8eb8ed',2,-6,3,-7]]){const l=new T.DirectionalLight(color,intensity);l.position.set(x,y,z);scene.add(l);}
const camera=new T.PerspectiveCamera(32,innerWidth/innerHeight,.1,200);
let current;
window.inspectAsset=async(kind,side=false)=>{
 if(current)disposeGroup(current);
 current=kind==='rover'?makeRover().group:makeEnemy(kind);scene.add(current);
 if(current.userData.tractorBeam)current.userData.tractorBeam.visible=false;
 const bounds=new T.Box3();current.updateMatrixWorld(true);current.traverse(o=>{if(o.isMesh&&o.visible&&o!==current.userData.tractorBeam)bounds.union(new T.Box3().setFromObject(o));});
 const size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
 let radius=Math.max(size.x,size.y,size.z)*1.7;
 const direction=new T.Vector3(side?0:0.8,side?0.2:0.65,1.7).normalize();
 for(let attempt=0;attempt<8;attempt++){
 camera.position.copy(center).addScaledVector(direction,radius);camera.lookAt(center);camera.updateMatrixWorld(true);
 let extent=0;for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){const p=new T.Vector3(x,y,z).project(camera);extent=Math.max(extent,Math.abs(p.x),Math.abs(p.y));}
 if(extent<.86)break;radius*=1.12;
 }
 renderer.render(scene,camera);
 const stats={kind,meshes:0,triangles:0,size:size.toArray(),draws:renderer.info.render.drawCalls};
 current.traverse(o=>{if(o.isMesh){stats.meshes++;stats.triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);}});
 document.querySelector('#caption').innerHTML=kind.toUpperCase()+'<small>Runtime geometry · neutral studio lighting · '+Math.round(stats.triangles).toLocaleString()+' triangles</small>';
 return stats;
};window.studioReady=true;
</script></body></html>`,
);
const browser = await launchBrowser();
const results = [],
  errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(new URL(`/${directory}/studio.html`, gameUrl()).href);
  await page.waitForFunction(() => window.studioReady, null, { timeout: 90000 });
  for (const kind of [
    'rover',
    'drone',
    'bomber',
    'hunter',
    'interceptor',
    'skimmer',
    'leech',
    'mine',
    'rock',
    'boss',
  ]) {
    results.push(await page.evaluate((kind) => window.inspectAsset(kind), kind));
    await page.screenshot({ path: `${directory}/${stage}-${kind}.png` });
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(await assetProvenance(), provenance, 'Source changed during capture');
  await fs.writeFile(
    `${directory}/${stage}-models.json`,
    JSON.stringify({ models: results, provenance, errors }, null, 2),
  );
  console.log(JSON.stringify({ stage, results, errors }));
} finally {
  await browser.close();
}
