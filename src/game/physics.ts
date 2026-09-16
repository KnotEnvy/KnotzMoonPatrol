import RAPIER from '@dimforge/rapier3d-compat';
// React StrictMode and HMR may mount overlapping engine instances.
// Initializing the WASM module again can invalidate an existing world's handles.
let initialization: Promise<void> | undefined;
export function initializePhysics(): Promise<void> {
  return (initialization ??= RAPIER.init());
}
