// PM2 설정 파일 - pm2 start ecosystem.config.js
module.exports = {
  apps: [{
    name: 'wedding-gift',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '200M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
