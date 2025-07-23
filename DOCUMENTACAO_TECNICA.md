# Documentação Técnica - Sistema de Gestão de Chamados

## 📋 Arquitetura do Sistema

### Visão Geral
O sistema segue uma arquitetura moderna baseada em:
- **Frontend**: Single Page Application (SPA) em React
- **Backend**: Firebase como Backend-as-a-Service (BaaS)
- **Microserviços**: Flask para conversão de PDF
- **Banco de Dados**: Firebase Firestore (NoSQL)
- **Autenticação**: Firebase Auth
- **Storage**: Firebase Storage para imagens

### Fluxo de Dados
```
[React Frontend] ↔ [Firebase SDK] ↔ [Firestore Database]
       ↓                                      ↑
[PDF Service] ← [HTTP API] ← [Report Generator]
```

## 🗄️ Estrutura do Banco de Dados

### Coleções Firestore

#### `usuarios`
```javascript
{
  id: string,                    // UID do Firebase Auth
  nome: string,                  // Nome completo
  email: string,                 // Email do usuário
  funcao: string,                // 'administrador' | 'produtor' | 'consultor' | 'gerente' | 'operador'
  area: string,                  // 'logistics' | 'warehouse' | 'visual_communication' | etc.
  ativo: boolean,                // Status ativo/inativo
  createdAt: Timestamp,          // Data de criação
  updatedAt: Timestamp           // Última atualização
}
```

#### `projetos`
```javascript
{
  id: string,                    // ID único do projeto
  nome: string,                  // Nome do projeto
  feira: string,                 // Nome da feira/evento
  local: string,                 // Local do evento
  cliente: string,               // Nome do cliente
  descricao: string,             // Descrição do projeto
  dataInicio: Timestamp,         // Data de início
  dataFim: Timestamp,            // Data de fim
  status: string,                // 'planejamento' | 'em_andamento' | 'concluido' | 'cancelado'
  produtorId: string,            // ID do produtor responsável
  produtorNome: string,          // Nome do produtor
  consultorId: string,           // ID do consultor responsável
  consultorNome: string,         // Nome do consultor
  equipe: string[],              // Array de IDs da equipe
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

#### `chamados`
```javascript
{
  id: string,                    // ID único do chamado
  titulo: string,                // Título do chamado
  descricao: string,             // Descrição detalhada
  projetoId: string,             // ID do projeto relacionado
  area: string,                  // Área responsável
  tipo: string,                  // Tipo do chamado
  prioridade: string,            // 'baixa' | 'media' | 'alta' | 'urgente'
  status: string,                // Status atual (9 possíveis)
  isExtra: boolean,              // Se é pedido extra
  motivoExtra: string,           // Motivo do pedido extra
  observacoes: string,           // Observações adicionais
  criadoPor: string,             // ID do criador
  criadoPorNome: string,         // Nome do criador
  responsavelId: string,         // ID do responsável atual
  responsavelNome: string,       // Nome do responsável
  imagens: Array<{               // Array de imagens
    url: string,                 // URL da imagem no Storage
    name: string,                // Nome do arquivo
    path: string                 // Path no Storage
  }>,
  slaOperacao: number,           // SLA de operação em minutos
  slaValidacao: number,          // SLA de validação em minutos
  executadoEm: Timestamp,        // Data de execução
  executadoPor: string,          // ID de quem executou
  executadoPorNome: string,      // Nome de quem executou
  validadoEm: Timestamp,         // Data de validação
  validadoPor: string,           // ID de quem validou
  validadoPorNome: string,       // Nome de quem validou
  motivoRejeicao: string,        // Motivo da rejeição (se aplicável)
  motivoCancelamento: string,    // Motivo do cancelamento (se aplicável)
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

#### `mensagens`
```javascript
{
  id: string,                    // ID único da mensagem
  chamadoId: string,             // ID do chamado
  autorId: string,               // ID do autor
  autorNome: string,             // Nome do autor
  texto: string,                 // Conteúdo da mensagem
  createdAt: Timestamp           // Data da mensagem
}
```

## 🔧 Serviços e APIs

### Frontend Services

#### `authService.js`
- Gerenciamento de autenticação
- Login/logout
- Recuperação de senha
- Gestão de estado do usuário

#### `userService.js`
- CRUD de usuários
- Validação de permissões
- Gestão de perfis

#### `projectService.js`
- CRUD de projetos
- Filtros por usuário
- Estatísticas de projeto

#### `ticketService.js`
- CRUD de chamados
- Gestão de status
- Cálculo de SLAs
- Upload de imagens

#### `messageService.js`
- Chat interno
- Histórico de mensagens
- Notificações em tempo real

#### `reportService.js`
- Geração de relatórios
- Cálculo de métricas
- Exportação de dados

#### `imageService.js`
- Upload para Firebase Storage
- Redimensionamento de imagens
- Validação de arquivos

### Backend Services

#### Flask PDF Service (`pdf-service/`)
```python
# Endpoints principais
POST /api/generate-pdf     # Conversão Markdown → PDF
GET  /api/health          # Health check
```

#### Firebase Functions (`functions/`)
```javascript
// Funções principais
sendEmailNotification()   # Envio de emails
onTicketCreate()         # Trigger na criação
onTicketUpdate()         # Trigger na atualização
onUserCreate()           # Setup inicial do usuário
```

## 🎨 Componentes Frontend

### Estrutura de Componentes

#### Pages
- `LoginPage` - Autenticação
- `DashboardPage` - Painel principal
- `NewTicketPage` - Criação de chamados
- `TicketDetailPage` - Detalhes do chamado
- `ProjectsPage` - Gestão de projetos
- `UsersPage` - Gestão de usuários
- `ReportsPage` - Relatórios

#### Forms
- `NewTicketForm` - Formulário de chamado
- `ProjectForm` - Formulário de projeto
- `UserForm` - Formulário de usuário

#### Layout
- `ProtectedRoute` - Rota protegida
- `Header` - Cabeçalho
- `Sidebar` - Menu lateral

### Estado Global

#### AuthContext
```javascript
{
  user: User | null,           // Usuário autenticado
  userProfile: UserProfile,    // Perfil do usuário
  loading: boolean,            // Estado de carregamento
  login: Function,             // Função de login
  logout: Function,            // Função de logout
  updateProfile: Function      // Atualizar perfil
}
```

## 🔐 Segurança e Permissões

### Regras do Firestore
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Usuários podem ler/escrever seus próprios dados
    match /usuarios/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Chamados - controle baseado em função
    match /chamados/{ticketId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && isValidUser();
      allow update: if request.auth != null && canUpdateTicket();
    }
    
    // Projetos - apenas admins e responsáveis
    match /projetos/{projectId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && isAdminOrResponsible();
    }
    
    // Mensagens - apenas participantes do chamado
    match /mensagens/{messageId} {
      allow read, write: if request.auth != null && isTicketParticipant();
    }
  }
}
```

### Controle de Acesso por Função

#### Administrador
- Acesso total ao sistema
- Gestão de usuários
- Configurações globais

#### Produtor
- Criação de chamados
- Validação final
- Gestão de projetos atribuídos

#### Consultor
- Criação de pendências
- Definição de prioridades
- Acompanhamento

#### Gerente
- Aprovação de extras
- Gestão da área
- Relatórios específicos

#### Operador
- Execução de chamados
- Atualização de status
- Upload de comprovantes

## 📊 Métricas e Analytics

### KPIs Calculados
- Taxa de conclusão por projeto
- Tempo médio de execução
- Cumprimento de SLAs
- Distribuição por área/prioridade
- Volume de chamados por período

### Fórmulas de Cálculo

#### SLA de Operação
```javascript
slaAtendido = (tempoExecucao <= slaOperacao)
tempoExecucao = executadoEm - createdAt
```

#### SLA de Validação
```javascript
slaAtendido = (tempoValidacao <= slaValidacao)
tempoValidacao = validadoEm - executadoEm
```

#### Taxa de Conclusão
```javascript
taxaConclusao = (chamadosConcluidos / totalChamados) * 100
```

## 🔄 Fluxo de Estados

### Máquina de Estados dos Chamados
```
[Aberto] → [Em Análise] → [Aguardando Aprovação] → [Aprovado]
                                    ↓                    ↓
                              [Rejeitado]         [Em Execução]
                                                        ↓
                                              [Executado - Aguardando Validação]
                                                        ↓
                                                  [Concluído]
                                                        
[Cancelado] ← (qualquer estado)
```

### Transições Válidas
```javascript
const validTransitions = {
  'aberto': ['em_analise', 'cancelado'],
  'em_analise': ['aguardando_aprovacao', 'aprovado', 'rejeitado', 'cancelado'],
  'aguardando_aprovacao': ['aprovado', 'rejeitado', 'cancelado'],
  'aprovado': ['em_execucao', 'cancelado'],
  'rejeitado': ['em_analise', 'cancelado'],
  'em_execucao': ['executado_aguardando_validacao', 'cancelado'],
  'executado_aguardando_validacao': ['concluido', 'em_execucao', 'cancelado'],
  'concluido': [], // Estado final
  'cancelado': []  // Estado final
}
```

## 🚀 Performance e Otimização

### Frontend
- Lazy loading de componentes
- Memoização com React.memo
- Debounce em buscas
- Paginação de listas
- Cache de dados frequentes

### Backend
- Índices compostos no Firestore
- Queries otimizadas
- Batch operations
- Cleanup de arquivos temporários
- Rate limiting nas APIs

### Storage
- Compressão de imagens
- CDN para assets estáticos
- Cleanup automático de uploads órfãos

## 🧪 Testes

### Estratégia de Testes
- **Unit Tests**: Funções utilitárias e serviços
- **Integration Tests**: APIs e Firebase
- **E2E Tests**: Fluxos críticos
- **Manual Tests**: UX e usabilidade

### Ferramentas Sugeridas
- Jest para unit tests
- React Testing Library
- Cypress para E2E
- Firebase Emulator Suite

## 📦 Deploy e CI/CD

### Ambientes
- **Development**: Local com Firebase Emulator
- **Staging**: Firebase projeto de teste
- **Production**: Firebase projeto principal

### Pipeline Sugerido
```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: npm test
  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: npm run build
      - run: firebase deploy
```

## 🔧 Manutenção

### Monitoramento
- Firebase Analytics
- Error tracking (Sentry)
- Performance monitoring
- Usage metrics

### Backup
- Firestore backup automático
- Storage backup
- Configurações versionadas

### Updates
- Dependências atualizadas mensalmente
- Security patches imediatos
- Feature releases trimestrais

---

Esta documentação deve ser mantida atualizada conforme o sistema evolui.

