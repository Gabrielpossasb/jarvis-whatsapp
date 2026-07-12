self.addEventListener("install", e => { self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(clients.claim()); });

self.addEventListener("push", e => {
  let title = "JARVIS";
  let body = "Nova notificação";
  try {
    const data = e.data.json();
    title = data.title || title;
    body = data.body || body;
  } catch {
    body = e.data?.text() || body;
  }
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
    })
  );
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(clients.openWindow("/"));
});
