@echo off
cls
title GitHub Upload - FLEXIVEL

echo ========================================
echo   UPLOAD PARA GITHUB - QUALQUER NOME
echo ========================================
echo.

echo Verificando Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ERRO: Node.js nao instalado!
    echo Baixe em: https://nodejs.org/
    pause
    exit
)
echo OK - Node.js instalado

echo.
echo Verificando Git...
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ERRO: Git nao instalado!
    echo Baixe em: https://git-scm.com/download/win
    pause
    exit
)
echo OK - Git instalado

echo.
echo Configurando Git automaticamente...
git config --global user.name "Cleiton"
git config --global user.email "cleiton@empresa.com"
git config --global init.defaultBranch main
echo OK - Git configurado

echo.
echo ========================================
echo   CRIE O REPOSITORIO NO GITHUB AGORA
echo ========================================
echo.
echo IMPORTANTE: Use QUALQUER nome que quiser!
echo.
echo Sugestoes:
echo - gestao-chamados-stands2 (seu backup)
echo - gestao-chamados-novo
echo - sistema-chamados-teste
echo - qualquer-nome-que-quiser
echo.
echo PASSO A PASSO:
echo 1. Abra: https://github.com/new
echo 2. Nome: gestao-chamados-stands2 (ou outro nome)
echo 3. Deixe PUBLICO ou PRIVADO (sua escolha)
echo 4. NAO marque nenhuma opcao extra
echo 5. Clique "Create repository"
echo 6. Copie a URL COMPLETA que aparece
echo.
echo Exemplo de URL:
echo https://github.com/cleitonpn/gestao-chamados-stands2.git
echo.

set /p repo_url="Cole a URL COMPLETA aqui: "

echo.
echo Limpando repositorio anterior (se existir)...
if exist ".git" rmdir /s /q .git
echo OK - Repositorio limpo

echo.
echo Inicializando novo repositorio...
git init
echo OK - Repositorio inicializado

echo.
echo Adicionando todos os arquivos...
git add .
echo OK - Arquivos adicionados

echo.
echo Criando commit inicial...
git commit -m "Sistema de gestao de chamados - versao refatorada"
if %errorlevel% neq 0 (
    echo ERRO: Falha no commit
    echo Verifique se existem arquivos na pasta
    pause
    exit
)
echo OK - Commit criado

echo.
echo Configurando branch principal...
git branch -M main
echo OK - Branch configurada

echo.
echo Conectando ao repositorio GitHub...
git remote add origin "%repo_url%"
echo OK - Repositorio conectado

echo.
echo ========================================
echo   FAZENDO UPLOAD PARA GITHUB...
echo ========================================
echo.
echo Isso pode demorar alguns minutos...
echo Aguarde sem fechar a janela!
echo.

git push -u origin main

if %errorlevel% eq 0 (
    echo.
    echo ========================================
    echo              SUCESSO TOTAL!
    echo ========================================
    echo.
    echo Sistema enviado para GitHub com sucesso!
    echo.
    echo SEU REPOSITORIO: %repo_url:~0,-4%
    echo.
    echo PROXIMOS PASSOS:
    echo.
    echo 1. TESTAR O SISTEMA:
    echo    - Acesse seu repositorio no GitHub
    echo    - Verifique se todos os arquivos estao la
    echo.
    echo 2. COLOCAR ONLINE (OPCIONAL):
    echo    - Acesse: https://vercel.com/
    echo    - Login com GitHub
    echo    - New Project
    echo    - Selecione seu repositorio
    echo    - Deploy
    echo.
    echo 3. BACKUP COMPLETO:
    echo    - Agora voce tem backup seguro no GitHub
    echo    - Pode testar sem medo de perder nada
    echo.
    echo PARABENS! Tudo funcionou perfeitamente!
    echo.
) else (
    echo.
    echo ========================================
    echo              ERRO NO UPLOAD
    echo ========================================
    echo.
    echo Possiveis causas:
    echo.
    echo 1. URL INCORRETA:
    echo    - Verifique se copiou a URL completa
    echo    - Deve terminar com .git
    echo    - Exemplo: https://github.com/usuario/repo.git
    echo.
    echo 2. REPOSITORIO NAO EXISTE:
    echo    - Verifique se criou o repositorio no GitHub
    echo    - Acesse: https://github.com/new
    echo.
    echo 3. SEM PERMISSAO:
    echo    - Verifique se esta logado no GitHub
    echo    - Repositorio deve ser seu
    echo.
    echo SOLUCAO: Execute o script novamente
    echo com a URL correta!
    echo.
)

echo.
echo Pressione qualquer tecla para fechar...
pause >nul

