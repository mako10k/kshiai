/**
 * PM2 process file (same pattern as kaix).
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 */
module.exports = {
  apps: [
    {
      name: "kshiai-backend",
      cwd: "/home/mako10k/kshiai/backend",
      script: "npm",
      args: "run start",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 20,
      min_uptime: "5s",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      // Production static build (more reliable than vite dev through Cloudflare/iOS)
      name: "kshiai-frontend",
      cwd: "/home/mako10k/kshiai/frontend",
      script: "npm",
      args: "run preview",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 20,
      min_uptime: "5s",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
