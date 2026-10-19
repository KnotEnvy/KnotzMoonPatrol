import * as T from 'three/webgpu';
import { pass, uniform, vec2 } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { chromaticAberration } from 'three/addons/tsl/display/ChromaticAberrationNode.js';
import { graphicsOptions, type GraphicsQuality } from './quality';

/** Own the optional HDR graph so switching presets releases its render targets. */
export class Graphics {
  private post?: T.PostProcessing;
  private scenePass?: ReturnType<typeof pass>;
  private glow?: ReturnType<typeof bloom>;
  private fringe = uniform(0);
  constructor(
    private renderer: T.WebGPURenderer,
    private scene: T.Scene,
    private camera: T.Camera,
  ) {}

  setQuality(quality: GraphicsQuality) {
    this.dispose();
    const webgpu = !!(
      'isWebGPUBackend' in this.renderer.backend && this.renderer.backend.isWebGPUBackend
    );
    const options = graphicsOptions(quality, webgpu, devicePixelRatio);
    this.renderer.setPixelRatio(options.pixelRatio);
    this.renderer.shadowMap.enabled = options.shadows;
    if (options.bloom) {
      this.scenePass = pass(this.scene, this.camera);
      const color = this.scenePass.getTextureNode('output');
      // Threshold > 1 keeps diffuse ground and HUD out of the glow.
      this.glow = bloom(color, 0.24, 0.35, 1.6);
      this.post = new T.PostProcessing(this.renderer);
      this.post.outputNode = chromaticAberration(color, this.fringe, vec2(0.5, 0.5)).add(this.glow);
    }
  }

  render(trauma: number) {
    // Speed changes keep the view stable; impacts retain their brief feedback.
    this.fringe.value = Math.min(0.12, trauma * 0.08);
    // Count the scene, shadow, bloom, and final composite draws as one frame.
    this.renderer.info.reset();
    if (this.post) this.post.render();
    else this.renderer.render(this.scene, this.camera);
  }

  get bloomEnabled() {
    return !!this.post;
  }
  dispose() {
    this.post?.dispose();
    this.glow?.dispose();
    this.scenePass?.dispose();
    this.post = undefined;
    this.glow = undefined;
    this.scenePass = undefined;
  }
}
