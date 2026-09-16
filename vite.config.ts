import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    rollupOptions: {
      output: { manualChunks: { three: ['three/webgpu'], physics: ['@dimforge/rapier3d-compat'] } },
    },
  },
});
