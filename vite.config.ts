import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // 무거운 벤더 분리(초기 로딩 최소화) — three·xlsx는 지연 로딩 컴포넌트에서만 사용
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/xlsx')) return 'xlsx';
          if (id.includes('node_modules/react')) return 'react-vendor';
        },
      },
    },
  },
});
