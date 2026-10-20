import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.API_PROXY_TARGET || 'http://127.0.0.1:3100'
  const url = new URL(target)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('API_PROXY_TARGET 必须为不含认证信息、参数和路径的 HTTP(S) 地址')
  }
  const proxy = { '/api': { target, changeOrigin: false, timeout: 15000, proxyTimeout: 15000 } }
  return {
    plugins: [vue()],
    // Preserve Host and Origin together: the backend's origin check still applies.
    server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
    preview: { host: '127.0.0.1', port: 4173, strictPort: true, proxy },
  }
})
