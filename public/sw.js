self.addEventListener('install', event => {
  // @ts-ignore
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  // @ts-ignore
  self.clients.claim();
});
self.addEventListener('fetch', () => {});
