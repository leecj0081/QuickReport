// Service Worker — FCM 백그라운드 푸시 수신
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:      "AIzaSyC9ORKNAg0YFlE9sIRt_CDvnWRoiEQrqI0",
  authDomain:  "aben0119.firebaseapp.com",
  databaseURL: "https://aben0119-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:   "aben0119",
  messagingSenderId: "811060567071",
  appId: "1:811060567071:web:853d0477f516debc00892a"
});

const messaging = firebase.messaging();

// 백그라운드 푸시 수신 (앱이 닫혀있거나 화면이 꺼진 상태)
messaging.onBackgroundMessage(payload => {
  const { title, body, icon } = payload.notification || {};
  const urgent = payload.data && (payload.data.sev === 'severe' || payload.data.sev === 'death');
  self.registration.showNotification(title || '🚨 현장 사고 퀵보고', {
    body: body || '새 사고 보고가 등록되었습니다.',
    icon: icon || '/QuickReport/icon-192.png',
    badge: '/QuickReport/icon-192.png',
    vibrate: urgent ? [200,100,200,100,200] : [200,100,200],
    tag: 'quickreport-' + Date.now(),
    requireInteraction: urgent, // 긴급은 사용자가 직접 닫을 때까지 유지
    data: payload.data || {}
  });
});

// 알림 클릭 시 앱으로 이동
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const url = 'https://leecj0081.github.io/QuickReport/사고퀵보고-20.html';
      for (const client of list) {
        if (client.url.includes('QuickReport') && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
