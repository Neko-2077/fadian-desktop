/**
 * 简易启动器 —— 不依赖 Electron，直接用浏览器打开前端
 * 
 * 用法: node start-dev.js
 * 然后打开 http://localhost:28999 即可看到界面
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { startServer, stopServer } = require('./pipeline-engine');

const PORT = 29000;
const FRONTEND = path.join(__dirname, 'frontend');

// 简易静态文件服务
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const staticServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const url = new URL(req.url, `http://localhost:${PORT}`);
  let filePath = path.join(FRONTEND, url.pathname === '/' ? 'index.html' : url.pathname);

  try {
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

async function main() {
  // 启动 API 服务
  await startServer();

  // 启动静态文件服务
  staticServer.listen(PORT, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════╗');
    console.log('  ║   ⚖️  法典 — AI 数字法务助手    ║');
    console.log('  ║                                ║');
    console.log(`  ║   浏览器打开                    ║`);
    console.log(`  ║   http://localhost:${PORT}          ║`);
    console.log('  ║                                ║');
    console.log('  ║   不需要 Electron！             ║');
    console.log('  ╚══════════════════════════════════╝');
    console.log('');
  });
}

process.on('SIGINT', async () => {
  console.log('\n关闭中...');
  staticServer.close();
  await stopServer();
  process.exit(0);
});

main();
