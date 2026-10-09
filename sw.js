const CACHE = 'brainy-shell-v33';
const SHELL = [
  './',
  './index.html',
  './session-actions.js',
  './project-store.js',
  './command-palette.js',
  './agent-mode.js',
  './expert-skills.js',
  './action-center.js',
  './home-dashboard.js',
  './local-tools.js',
  './local-tools-ui.js',
  './local-tools-controller.js',
  './approval-queue.js',
  './agent-hq.js',
  './markdown-renderer.js',
  './manifest.webmanifest',
  './backend.json',
  './icons/brainy-192.png',
  './icons/brainy-512.png',
  './fonts-terminal/JetBrainsMono-Regular.woff2',
  './fonts-terminal/JetBrainsMono-Bold.woff2'
];
const SHELL_PATHS = new Set(SHELL.map((path) => new URL(path, self.location.href).pathname));

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
  )));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      if (response.ok && SHELL_PATHS.has(url.pathname)) {
        const cache = await caches.open(CACHE);
        await cache.put(event.request, response.clone());
      }
      return response;
    } catch {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      if (event.request.mode === 'navigate') {
        return (await caches.match('./index.html')) || Response.error();
      }
      return Response.error();
    }
  })());
});
