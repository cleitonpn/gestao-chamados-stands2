#!/usr/bin/env python3
"""
Servidor Flask para Domínio Personalizado
Serve o sistema com suporte a domínio personalizado
"""

from flask import Flask, send_from_directory, request, redirect, url_for
import os
import mimetypes

app = Flask(__name__)

# Configurações
DIST_DIR = '/home/ubuntu/gestao-chamados-stands/dist'
ALLOWED_HOSTS = ['sistemastands.com.br', 'www.sistemastands.com.br', 'localhost', '127.0.0.1']

@app.before_request
def before_request():
    # Verificar se o host é permitido
    host = request.headers.get('Host', '').split(':')[0]
    
    # Permitir hosts locais e da plataforma Manus
    if (host in ALLOWED_HOSTS or 
        host.endswith('.manusvm.computer') or 
        host.endswith('.manus.space') or
        host.startswith('localhost') or
        host.startswith('127.0.0.1')):
        pass
    else:
        # Redirecionar para domínio principal se necessário
        if host:
            return redirect(f"https://sistemastands.com.br{request.path}")

@app.route('/')
def index():
    return send_from_directory(DIST_DIR, 'index.html')

@app.route('/<path:path>')
def serve_file(path):
    try:
        # Tentar servir arquivo estático
        if os.path.exists(os.path.join(DIST_DIR, path)):
            return send_from_directory(DIST_DIR, path)
        else:
            # Para SPA, retornar index.html para rotas não encontradas
            return send_from_directory(DIST_DIR, 'index.html')
    except Exception as e:
        print(f"Erro ao servir arquivo: {e}")
        return send_from_directory(DIST_DIR, 'index.html')

@app.after_request
def after_request(response):
    # Headers de segurança
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    
    # CORS para desenvolvimento
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    
    return response

@app.errorhandler(404)
def not_found(error):
    return send_from_directory(DIST_DIR, 'index.html')

if __name__ == '__main__':
    print("Servidor Flask iniciado!")
    print(f"Servindo arquivos de: {DIST_DIR}")
    print(f"Hosts permitidos: {ALLOWED_HOSTS}")
    print("Acesso via:")
    print("- http://localhost:5000")
    print("- https://sistemastands.com.br (após configuração)")
    
    app.run(
        host='0.0.0.0',
        port=5000,
        debug=False,
        threaded=True
    )

