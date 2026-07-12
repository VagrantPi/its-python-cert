#!/usr/bin/env node
// ITS Python Hub — 簡易區網靜態伺服器（零依賴，只用 Node 內建模組）
// 用法：node server.js [port]     預設 port 8080
// 讓同一個 WiFi（同網段）底下的同學，用你電腦的區網 IP 就能瀏覽網頁。

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = __dirname;                       // 以本檔所在資料夾為根目錄
const PORT = Number(process.argv[2] || process.env.PORT || 8081);
const DEFAULT_FILE = 'index.html';   // 首頁

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm':  'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md':   'text/plain; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.txt':  'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  // 只允許 GET / HEAD
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Allow': 'GET, HEAD' });
    return res.end('405 Method Not Allowed');
  }

  // 解析路徑並防止目錄穿越（../）
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/' + DEFAULT_FILE;
  const filePath = path.join(ROOT, path.normalize(urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); return res.end('403 Forbidden');
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('<h1>404 Not Found</h1><p><a href="/">回首頁</a></p>');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
  });
});

// 取得本機所有區網 IPv4 位址
function lanAddresses() {
  const nets = os.networkInterfaces();
  const out = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

server.listen(PORT, '0.0.0.0', () => {
  const ips = lanAddresses();
  console.log('\n  ✅ ITS Python Hub 伺服器已啟動\n');
  console.log('  本機瀏覽：');
  console.log(`     http://localhost:${PORT}\n`);
  if (ips.length) {
    console.log('  同一個 WiFi 底下的同學，用手機/電腦瀏覽器開：');
    ips.forEach(ip => console.log(`     http://${ip}:${PORT}`));
  } else {
    console.log('  （偵測不到區網 IP，請確認已連上 WiFi）');
  }
  console.log('\n  按 Ctrl+C 可停止伺服器。\n');
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n  ⚠️  Port ${PORT} 已被占用。改用其他 port，例如：node server.js 8090\n`);
  } else {
    console.error('伺服器錯誤：', e.message);
  }
  process.exit(1);
});
