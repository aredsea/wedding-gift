#!/bin/bash
# === 축의금 정리 서버 한방 배포 스크립트 ===
# 오라클 서버에 SSH 접속 후 이 내용을 그대로 복붙하세요.

set -e

echo "🔧 Node.js 설치 확인..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "  Node $(node -v) 설치됨"

echo "🔧 Git 설치 확인..."
if ! command -v git &> /dev/null; then
  sudo apt-get install -y git
fi

echo "📦 소스 다운로드..."
cd ~
if [ -d "wedding-gift" ]; then
  cd wedding-gift && git pull
else
  git clone https://github.com/aredsea/wedding-gift.git
  cd wedding-gift
fi

echo "📦 패키지 설치..."
cd server
npm install

echo "🔧 PM2 설치..."
if ! command -v pm2 &> /dev/null; then
  sudo npm install -g pm2
fi

echo "🚀 서버 시작..."
pm2 delete wedding-gift 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

echo "🔥 방화벽 포트 열기..."
sudo iptables -I INPUT -p tcp --dport 3000 -j ACCEPT 2>/dev/null || true
sudo netfilter-persistent save 2>/dev/null || true

echo ""
echo "✅ 배포 완료!"
echo "🌐 http://$(curl -s ifconfig.me):3000"
echo ""
