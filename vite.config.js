import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
export default defineConfig({
    plugins: [react()],
    server: {
        host: '0.0.0.0',
        port: 5173,
        proxy: {
            '/api/who': {
                target: 'https://ghoapi.azureedge.net',
                changeOrigin: true,
                secure: true,
                rewrite: function (path) { return path.replace(/^\/api\/who/, ''); },
            },
        },
    },
    preview: {
        host: '0.0.0.0',
        port: 4173,
    },
});
