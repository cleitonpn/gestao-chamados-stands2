// public/firebase-messaging-sw.js

// Importa os scripts do Firebase (versão compat, mais segura para SW)
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// ⚠️ COLE A CONFIGURAÇÃO DO SEU FIREBASE AQUI
// (É a mesma que você usa no seu 'firebase.js' no frontend)
const firebaseConfig = {
  apiKey: "SUA_API_KEY",
  authDomain: "SEU_AUTH_DOMAIN",
  projectId: "SEU_PROJECT_ID",
  storageBucket: "SEU_STORAGE_BUCKET",
  messagingSenderId: "SEU_MESSAGING_SENDER_ID",
  appId: "SEU_APP_ID"
};

// Inicializa o Firebase no Service Worker
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Handler para receber a notificação com o app em 2º plano ou fechado
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Mensagem recebida: ', payload);

  // Pega os dados da notificação enviada pela Cloud Function
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: payload.notification.icon || '/icons/icon-192x192.png', // Ícone padrão
    badge: payload.notification.badge || '/icons/badge-72x72.png', // Ícone da barra (Android)
    data: payload.data, // Guarda a URL e outros dados (ex: { url: '/chamado/...' })
  };

  // Exibe a notificação na tela do usuário
  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handler para o clique na notificação
self.addEventListener('notificationclick', (event) => {
  event.notification.close(); // Fecha a notificação

  // Abre a URL que foi enviada no 'data.url' (que definimos no index.js)
  const urlToOpen = event.notification.data.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      // Tenta focar em uma aba já aberta com essa URL
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // Se não houver, abre uma nova janela
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
