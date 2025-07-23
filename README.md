# Sistema de Gestão de Chamados para Montagem de Stands

## 📋 Sobre o Projeto

Sistema completo de gestão de chamados desenvolvido especificamente para empresas de montagem de stands em feiras e eventos. O sistema facilita a comunicação entre produtores, equipes de montagem e operações do escritório, centralizando solicitações de fretes, trocas de mobiliário, materiais e comunicação visual.

## 🎯 Funcionalidades Principais

### 👥 Gestão de Usuários
- Sistema de autenticação com Firebase Auth
- Perfis por função: Administrador, Produtor, Consultor, Gerente, Operador
- Controle de acesso baseado em funções
- Gestão de áreas: Logística, Almoxarifado, Comunicação Visual, Locação, etc.

### 🏗️ Gestão de Projetos
- CRUD completo de projetos
- Atribuição de produtores e consultores
- Controle de datas e status
- Vinculação de chamados aos projetos

### 🎫 Sistema de Chamados
- Criação de chamados com categorização por área e tipo
- Sistema de prioridades (Baixa, Média, Alta, Urgente)
- Upload múltiplo de imagens
- Fluxo completo de status (9 estados)
- Validação em duas etapas (operação + produtor)
- Chat interno por chamado
- Cálculo automático de SLAs

### 📊 Relatórios e Analytics
- Relatórios detalhados por projeto
- Relatórios individuais por chamado
- Análise de SLAs e tempos de execução
- Estatísticas por área, prioridade e status
- Exportação em PDF

### 📧 Notificações
- Sistema de notificações por email
- Direcionamento automático por área responsável
- Templates HTML profissionais

## 🛠️ Tecnologias Utilizadas

### Frontend
- **React 18** - Framework principal
- **Tailwind CSS** - Estilização
- **shadcn/ui** - Componentes de interface
- **Lucide React** - Ícones
- **React Router** - Roteamento

### Backend
- **Firebase Firestore** - Banco de dados NoSQL
- **Firebase Auth** - Autenticação
- **Firebase Storage** - Armazenamento de imagens
- **Firebase Functions** - Funções serverless
- **Flask** - Serviço de conversão PDF

### Ferramentas
- **Vite** - Build tool
- **Node.js** - Runtime
- **Python** - Backend services
- **manus-md-to-pdf** - Conversão de relatórios

## 📁 Estrutura do Projeto

```
gestao-chamados-stands/
├── src/
│   ├── components/          # Componentes React
│   │   ├── forms/          # Formulários
│   │   └── layout/         # Layout components
│   ├── contexts/           # Contextos React
│   ├── pages/              # Páginas da aplicação
│   ├── services/           # Serviços e APIs
│   ├── config/             # Configurações
│   └── utils/              # Utilitários
├── pdf-service/            # Serviço Flask para PDF
│   ├── src/
│   │   ├── routes/         # Rotas Flask
│   │   └── models/         # Modelos de dados
│   └── venv/               # Ambiente virtual Python
├── functions/              # Firebase Functions
└── docs/                   # Documentação
```

## 🚀 Instalação e Configuração

### Pré-requisitos
- Node.js 18+
- Python 3.11+
- Conta Firebase
- Git

### 1. Clone o Repositório
```bash
git clone [url-do-repositorio]
cd gestao-chamados-stands
```

### 2. Instale as Dependências
```bash
# Frontend
npm install

# Serviço PDF
cd pdf-service
python -m venv venv
source venv/bin/activate  # Linux/Mac
# ou
venv\Scripts\activate     # Windows
pip install -r requirements.txt
cd ..
```

### 3. Configure o Firebase
1. Siga as instruções em `FIREBASE_CONFIG.md`
2. Substitua as configurações em `src/config/firebase.js`
3. Configure as regras do Firestore e Storage

### 4. Execute a Aplicação
```bash
# Terminal 1 - Frontend
npm run dev --host

# Terminal 2 - Serviço PDF
cd pdf-service
source venv/bin/activate
python src/main.py
```

### 5. Acesse a Aplicação
- Frontend: http://localhost:5173
- Serviço PDF: http://localhost:5001

## 👤 Usuários e Perfis

### Administrador
- Acesso completo ao sistema
- Gestão de usuários e projetos
- Visualização de todos os chamados
- Geração de relatórios

### Produtor
- Criação e acompanhamento de chamados
- Validação final dos chamados executados
- Gestão de projetos atribuídos
- Chat interno

### Consultor
- Criação de chamados de pendências
- Definição de prioridades
- Acompanhamento de execução
- Upload de comprovantes

### Gerente (por área)
- Aprovação de pedidos extras
- Gestão de chamados da sua área
- Relatórios específicos
- Controle de SLAs

### Operador
- Execução de chamados
- Atualização de status
- Upload de comprovantes
- Chat interno

## 🔄 Fluxo de Trabalho

### Estados dos Chamados
1. **Aberto** - Chamado criado
2. **Em Análise** - Sendo analisado pela área
3. **Aguardando Aprovação** - Pedidos extras aguardando aprovação
4. **Aprovado** - Aprovado para execução
5. **Rejeitado** - Rejeitado com motivo
6. **Em Execução** - Sendo executado
7. **Executado - Aguardando Validação** - Executado, aguardando validação do produtor
8. **Concluído** - Validado e finalizado
9. **Cancelado** - Cancelado com justificativa

### SLAs Automáticos
- **SLA de Operação**: Tempo para execução (configurável por tipo)
- **SLA de Validação**: Tempo para validação do produtor (padrão: 2 horas)

## 📱 Interface e Experiência

### Design System
- Tema claro e profissional
- Navegação por cards e seções flutuantes
- Design responsivo (mobile e desktop)
- Componentes consistentes com shadcn/ui

### Funcionalidades de UX
- Preview de imagens antes do upload
- Chat em tempo real
- Notificações visuais de status
- Filtros e busca avançada
- Estatísticas em tempo real

## 📊 Relatórios

### Tipos de Relatório
- **Por Projeto**: Estatísticas completas, lista de chamados, histórico
- **Por Chamado**: Detalhes, timeline, SLAs, comunicação

### Métricas Incluídas
- Taxa de conclusão
- Distribuição por status, área e prioridade
- Análise de SLAs
- Tempo médio de execução
- Histórico completo de comunicação

## 🔒 Segurança

- Autenticação via Firebase Auth
- Regras de segurança no Firestore
- Controle de acesso baseado em funções
- Upload seguro de imagens
- Validação de dados no frontend e backend

## 🚀 Deploy

### Frontend (Vercel/Netlify)
```bash
npm run build
# Deploy da pasta dist/
```

### Backend (Firebase)
```bash
firebase deploy --only functions
firebase deploy --only firestore:rules
firebase deploy --only storage
```

### Serviço PDF (Heroku/Railway)
```bash
cd pdf-service
# Seguir instruções da plataforma escolhida
```

## 📞 Suporte

Para dúvidas ou problemas:
1. Consulte a documentação em `/docs`
2. Verifique as configurações do Firebase
3. Teste as conexões de rede
4. Consulte os logs do console

## 📄 Licença

Este projeto foi desenvolvido especificamente para empresas de montagem de stands e eventos.

## 🤝 Contribuição

Para contribuir com o projeto:
1. Faça um fork do repositório
2. Crie uma branch para sua feature
3. Commit suas mudanças
4. Abra um Pull Request

---

**Desenvolvido com ❤️ para otimizar a gestão de chamados em montagem de stands**

