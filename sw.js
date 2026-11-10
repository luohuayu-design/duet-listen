/* 离线缓存：第一次打开后，断网也能启动 APP、播放本机已保存的歌。
   页面本体「先联网拿新版，4 秒没响应就用缓存」，保证更新和离线都能兼顾；
   图标等静态资源改成「先给缓存、后台悄悄更新」，第二次打开更快。 */
const CACHE = "duetlisten-v3";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => {})
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* 4 秒还没拿到新页面就先用缓存，避免弱网下一直白屏 */
function netFirst(req, timeout) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      caches.match("./index.html").then((hit) => resolve(hit || fetch(req)));
    }, timeout);
    fetch(req).then((resp) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (resp && resp.status === 200) {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put("./index.html", copy)).catch(() => {});
      }
      resolve(resp);
    }).catch(() => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      caches.match("./index.html").then((hit) => resolve(hit || Response.error()));
    });
  });
}

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  const isPage = e.request.mode === "navigate" ||
    url.pathname.endsWith("/") ||
    url.pathname.endsWith(".html");

  if (isPage) {
    e.respondWith(netFirst(e.request, 4000));
    return;
  }

  /* 静态资源：缓存优先 + 后台刷新 */
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const net = fetch(e.request).then((resp) => {
        if (resp && resp.status === 200) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return resp;
      }).catch(() => hit || caches.match("./index.html"));
      return hit || net;
    })
  );
});
