#!/bin/bash

# Script de Deploy Automatizado - Sistema de Gestão de Chamados
# Autor: Manus AI
# Data: 14 de Julho de 2025

set -e  # Parar execução em caso de erro

echo "🚀 Iniciando processo de deploy..."

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Função para logs coloridos
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Verificar se estamos no diretório correto
if [ ! -f "package.json" ]; then
    log_error "Arquivo package.json não encontrado. Execute este script no diretório raiz do projeto."
    exit 1
fi

log_info "Verificando dependências..."

# Verificar se pnpm está instalado
if ! command -v pnpm &> /dev/null; then
    log_warning "pnpm não encontrado. Instalando..."
    npm install -g pnpm
fi

# Verificar se vercel CLI está instalado
if ! command -v vercel &> /dev/null; then
    log_warning "Vercel CLI não encontrado. Instalando..."
    npm install -g vercel
fi

log_success "Dependências verificadas"

# Instalar dependências do projeto
log_info "Instalando dependências do projeto..."
pnpm install

# Executar testes (se existirem)
if [ -f "package.json" ] && grep -q "\"test\"" package.json; then
    log_info "Executando testes..."
    pnpm test --passWithNoTests
    log_success "Testes executados com sucesso"
fi

# Build do projeto
log_info "Construindo projeto para produção..."
pnpm build
log_success "Build concluído com sucesso"

# Verificar se o build foi criado
if [ ! -d "dist" ]; then
    log_error "Diretório dist não foi criado. Verifique o processo de build."
    exit 1
fi

# Commit das alterações (se houver)
if [ -n "$(git status --porcelain)" ]; then
    log_info "Commitando alterações..."
    git add .
    git commit -m "Deploy: $(date '+%Y-%m-%d %H:%M:%S')" || log_warning "Nenhuma alteração para commit"
    git push origin main || log_warning "Erro ao fazer push. Continuando..."
fi

# Deploy no Vercel
log_info "Iniciando deploy no Vercel..."
vercel --prod --yes

log_success "🎉 Deploy concluído com sucesso!"
log_info "Aguarde alguns minutos para propagação completa"

echo ""
echo "📋 Próximos passos:"
echo "1. Verificar funcionamento do site"
echo "2. Testar todas as funcionalidades principais"
echo "3. Configurar monitoramento se ainda não foi feito"
echo "4. Atualizar DNS se necessário"
echo ""
echo "🔗 Links úteis:"
echo "- Painel Vercel: https://vercel.com/dashboard"
echo "- Painel Cloudflare: https://dash.cloudflare.com/"
echo "- Repositório GitHub: https://github.com/seu-usuario/gestao-chamados-stands"

