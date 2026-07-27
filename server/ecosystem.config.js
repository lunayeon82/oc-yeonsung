module.exports = {
  apps: [
    {
      name: 'oc-yeonsung-api',
      script: './src/server.js',
      cwd: __dirname,
      instances: 1, // SQLite is a single file — multiple instances would fight over the same WAL lock
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      // server/.env is loaded by `require('dotenv').config()` in src/server.js itself
      // (relative to `cwd` above), so pm2 doesn't need to inject env vars separately.
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
    },
  ],
};
