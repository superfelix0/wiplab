import { defineConfig } from 'vite';

// wiplabs.pages.dev/wip-g/ 경로 배포 기준
export default defineConfig({
  base: '/wip-g/',
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
});
