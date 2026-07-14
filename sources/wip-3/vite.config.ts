import { defineConfig } from 'vite';

// wiplabs.pages.dev/wip-3/ 경로 배포 기준
export default defineConfig({
  base: '/wip-3/',
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
});
