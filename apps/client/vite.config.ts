import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // In development, the WebSocket is proxied to the game server.
    proxy: { '/ws': { target: 'ws://localhost:3000', ws: true } },
  },
});
