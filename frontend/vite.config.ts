import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  envDir: "..",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5188,
    strictPort: true,
    // Host header from cloudflared (kshiai.mk10.org)
    allowedHosts: ["kshiai.mk10.org", "localhost", "127.0.0.1"],
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3088",
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            const host = req.headers.host;
            if (host) proxyReq.setHeader("x-forwarded-host", host);
            // Cloudflare terminates TLS; browser origin is HTTPS when Host is public.
            if (host?.includes("mk10.org")) {
              proxyReq.setHeader("x-forwarded-proto", "https");
            }
          });
        },
      },
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 5188,
    strictPort: true,
    allowedHosts: ["kshiai.mk10.org", "localhost", "127.0.0.1"],
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3088",
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            const host = req.headers.host;
            if (host) proxyReq.setHeader("x-forwarded-host", host);
            if (host?.includes("mk10.org")) {
              proxyReq.setHeader("x-forwarded-proto", "https");
            }
          });
        },
      },
    },
  },
});
