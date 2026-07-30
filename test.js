const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');

test('bridge keeps all backend calls on the dynamic tunnel', () => {
  assert.match(html, /let backendUrl/);
  assert.match(html, /fetch\(`\$\{backendUrl\}\/api\/auth\/ws-ticket`/);
  assert.match(html, /fetch\(`\$\{backendUrl\}\/api\/brainy\/codex-usage`/);
  assert.match(html, /new WebSocket\(`\$\{proto\}\/\/\$\{wsBackend\.host\}/);
});

test('repository contains no access key or backend URL', () => {
  assert.doesNotMatch(html, /trycloudflare\.com/);
  assert.doesNotMatch(html, /access=[a-f0-9]{32,}/);
});

test('fonts are served by GitHub Pages using relative paths', () => {
  assert.match(html, /\.\/fonts-terminal\/JetBrainsMono-Regular\.woff2/);
  assert.match(html, /\.\/fonts-terminal\/JetBrainsMono-Bold\.woff2/);
});

test('app is installable and keeps its secure backend after launch', () => {
  assert.match(html, /rel="manifest" href="\.\/manifest\.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon"/);
  assert.match(html, /localStorage\.setItem\('brainy_backend'/);
  assert.match(html, /localStorage\.getItem\('brainy_backend'/);
  assert.match(html, /serviceWorker\.register\('\.\/sw\.js'/);
});

test('mobile app fills the true phone viewport without desktop overflow', () => {
  assert.match(html, /\.app \{[^}]*width:100%;[^}]*min-width:0;[^}]*overflow:hidden;/s);
  assert.match(html, /@media \(max-width:640px\)[\s\S]*\.app \{[^}]*width:100dvw;[^}]*height:100dvh;/);
  assert.match(html, /@media \(max-width:640px\)[\s\S]*\.message \{[^}]*grid-template-columns:1fr;/);
  assert.match(html, /@media \(max-width:640px\)[\s\S]*\.prompt-chip \{[^}]*width:100%;[^}]*min-height:48px;/);
});

test('mobile composer can preview and securely attach a camera or gallery photo', () => {
  assert.match(html, /<input[^>]+id="imageInput"[^>]+type="file"[^>]+accept="image\/\*"[^>]*>/);
  assert.match(html, /id="attachBtn"/);
  assert.match(html, /id="attachmentPreview"/);
  assert.match(html, /rpc\('image\.attach_bytes',\{session_id:sid,content_base64:image\.base64,filename:image\.name\}\)/);
  assert.match(html, /const MAX_IMAGE_DIMENSION = 1600/);
  assert.match(html, /className = 'chat-image'/);
});

test('app discovers the latest rotating backend without storing its access key', () => {
  const config = JSON.parse(fs.readFileSync('backend.json', 'utf8'));
  assert.match(config.backend, /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/);
  assert.equal(Object.hasOwn(config, 'access'), false);
  assert.match(html, /fetch\('\.\/backend\.json',\s*\{cache:'no-store'\}\)/);
  assert.match(html, /async function refreshBackend/);
});

test('manifest and service worker provide a standalone offline app shell', () => {
  const manifest = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));
  const sw = fs.readFileSync('sw.js', 'utf8');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  assert.match(html, /start_url:location\.href/);
  assert.match(html, /data:application\/manifest\+json/);
  assert.equal(manifest.name, 'BRAINY Desk');
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192'));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512'));
  assert.match(sw, /index\.html/);
  assert.match(sw, /manifest\.webmanifest/);
});
