import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { agentSessionsDevApi } from "./vite-plugins/agentSessionsDevApi.mjs";

export default defineConfig(({ mode }) => {
  // 将根目录 `.env` 注入 process.env，供 dev 中间件（如 SRE Agent → OpenClaw）读取 OPENCLAW_* 等变量。
  // Vite 默认只把 VITE_ 前缀暴露给前端，不会自动把其它键写入 process.env。
  const loaded = loadEnv(mode, process.cwd(), "");
  for (const [k, v] of Object.entries(loaded)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }

  return {
    plugins: [react(), agentSessionsDevApi()],
    resolve: {
      alias: {
        "@": "/frontend",
      },
    },
    /** `vite preview` 时可将 /api 转发到独立服务（先运行 `node backend/serveAgentSessionsApi.mjs`） */
    preview: {
      proxy: {
        "/api": { target: "http://127.0.0.1:8787", changeOrigin: true },
      },
    },
  };
});
