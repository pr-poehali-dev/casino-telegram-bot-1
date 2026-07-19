self.addEventListener('push', (event) => {
  let data = { title: 'Уведомление', body: '', url: '/' };
  try {
    data = event.data.json();
  } catch (e) {
    data.body = event.data ? event.data.text() : '';
  }

  const options = {
    body: data.body,
    icon: 'https://cdn.poehali.dev/projects/1884faf0-6fc4-4d86-97bc-483f91e28b3a/files/favicon-1784156449319.png',
    badge: 'https://cdn.poehali.dev/projects/1884faf0-6fc4-4d86-97bc-483f91e28b3a/files/favicon-1784156449319.png',
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
