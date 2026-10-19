import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'pages' ? '/KnotzMoonPatrol/' : '/',
  server: { watch: { ignored: ['**/benchmark-dist/**', '**/test-results/**'] } },
  build: {
    outDir: mode === 'benchmark' ? 'benchmark-dist' : 'dist',
    target: 'es2022',
    rollupOptions: {
      output: { manualChunks: { three: ['three/webgpu'], physics: ['@dimforge/rapier3d-compat'] } },
    },
  },
}));
