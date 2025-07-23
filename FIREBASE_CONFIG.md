# Configuração do Firebase

Para que o sistema funcione completamente, você precisa configurar um projeto Firebase e substituir as configurações no arquivo `src/config/firebase.js`.

## Passos para Configuração:

### 1. Criar Projeto Firebase
1. Acesse [Firebase Console](https://console.firebase.google.com/)
2. Clique em "Adicionar projeto"
3. Siga os passos para criar o projeto

### 2. Configurar Authentication
1. No painel do Firebase, vá para "Authentication"
2. Clique em "Começar"
3. Na aba "Sign-in method", habilite "Email/senha"

### 3. Configurar Firestore Database
1. No painel do Firebase, vá para "Firestore Database"
2. Clique em "Criar banco de dados"
3. Escolha "Começar no modo de teste" (para desenvolvimento)
4. Selecione uma localização

### 4. Configurar Storage
1. No painel do Firebase, vá para "Storage"
2. Clique em "Começar"
3. Aceite as regras padrão (para desenvolvimento)

### 5. Obter Configurações
1. No painel do Firebase, vá para "Configurações do projeto" (ícone de engrenagem)
2. Na seção "Seus aplicativos", clique em "Adicionar app" e escolha "Web"
3. Registre o app e copie as configurações

### 6. Atualizar o Arquivo de Configuração
Substitua as configurações no arquivo `src/config/firebase.js`:

```javascript
const firebaseConfig = {
  apiKey: "sua-api-key-aqui",
  authDomain: "seu-projeto.firebaseapp.com",
  projectId: "seu-projeto-id",
  storageBucket: "seu-projeto.appspot.com",
  messagingSenderId: "123456789",
  appId: "seu-app-id"
};
```

### 7. Configurar Regras do Firestore
No console do Firebase, vá para Firestore Database > Regras e use:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Permitir leitura/escrita para usuários autenticados
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### 8. Configurar Regras do Storage
No console do Firebase, vá para Storage > Regras e use:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### 9. Configurar Firebase Functions (Opcional)
Para notificações por email:

1. Instale Firebase CLI: `npm install -g firebase-tools`
2. Faça login: `firebase login`
3. Inicialize Functions: `firebase init functions`
4. Deploy das functions: `firebase deploy --only functions`

## Usuário Administrador Inicial

Após configurar o Firebase, crie o primeiro usuário administrador:

1. Registre-se na aplicação com email e senha
2. No console do Firestore, vá para a coleção `usuarios`
3. Encontre o documento do seu usuário
4. Edite o documento e adicione:
   ```json
   {
     "funcao": "administrador",
     "nome": "Seu Nome",
     "area": "operacional"
   }
   ```

## Testando a Aplicação

1. Inicie o servidor React: `npm run dev --host`
2. Inicie o serviço PDF: `cd pdf-service && source venv/bin/activate && python src/main.py`
3. Acesse http://localhost:5173
4. Faça login com suas credenciais
5. Teste todas as funcionalidades

## Estrutura de Dados

O sistema criará automaticamente as seguintes coleções no Firestore:

- `usuarios` - Perfis dos usuários
- `projetos` - Projetos de montagem
- `chamados` - Chamados de suporte
- `mensagens` - Mensagens do chat interno

Todas as coleções seguem a estrutura definida nos serviços da aplicação.

