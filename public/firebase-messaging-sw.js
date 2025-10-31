// public/firebase-messaging-sw.js

// Importa os scripts do Firebase
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// ⚠️ COLOQUE AQUI A CONFIGURAÇÃO DO SEU FIREBASE
// (A mesma que você usa no seu app React)
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// Este é o handler que recebe o push quando o app está fechado ou em 2º plano
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Mensagem recebida em 2º plano: ', payload);

  // Extrai o título e corpo da notificação
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: payload.notification.icon || '/icons/icon-192x192.png',
    badge: payload.notification.badge || '/icons/badge-72x72.png',
    data: payload.data, // Guarda os dados (ex: URL)
  };

  // Exibe a notificação
  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Evento de clique na notificação
self.addEventListener('notificationclick', (event) => {
  event.notification.close(); // Fecha a notificação
  
  // Abre a URL que foi enviada no 'data' (ou a home)
  const urlToOpen = event.notification.data.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
