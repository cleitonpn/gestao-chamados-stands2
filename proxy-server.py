#!/usr/bin/env python3
"""
Proxy Reverso para Domínio Personalizado
Redireciona requisições de sistemastands.com.br para o servidor local
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import urllib.request
import urllib.parse
import json
import ssl
import socket

class ProxyHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.proxy_request()
    
    def do_POST(self):
        self.proxy_request()
    
    def do_PUT(self):
        self.proxy_request()
    
    def do_DELETE(self):
        self.proxy_request()
    
    def proxy_request(self):
        try:
            # URL do servidor local
            target_url = f"http://127.0.0.1:4000{self.path}"
            
            # Criar requisição
            req = urllib.request.Request(target_url)
            
            # Copiar headers (exceto Host)
            for header, value in self.headers.items():
                if header.lower() not in ['host', 'connection']:
                    req.add_header(header, value)
            
            # Adicionar body para POST/PUT
            if self.command in ['POST', 'PUT']:
                content_length = int(self.headers.get('Content-Length', 0))
                if content_length > 0:
                    body = self.rfile.read(content_length)
                    req.data = body
            
            # Fazer requisição
            with urllib.request.urlopen(req) as response:
                # Enviar status
                self.send_response(response.getcode())
                
                # Enviar headers
                for header, value in response.headers.items():
                    if header.lower() not in ['connection', 'transfer-encoding']:
                        self.send_header(header, value)
                
                # Headers de segurança
                self.send_header('X-Frame-Options', 'DENY')
                self.send_header('X-Content-Type-Options', 'nosniff')
                self.send_header('X-XSS-Protection', '1; mode=block')
                self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
                
                self.end_headers()
                
                # Enviar conteúdo
                self.wfile.write(response.read())
                
        except Exception as e:
            print(f"Erro no proxy: {e}")
            self.send_error(502, f"Bad Gateway: {str(e)}")
    
    def log_message(self, format, *args):
        print(f"[PROXY] {format % args}")

def run_proxy():
    server_address = ('0.0.0.0', 8090)
    httpd = HTTPServer(server_address, ProxyHandler)
    print(f"Proxy rodando em http://0.0.0.0:8090")
    print(f"Redirecionando para http://127.0.0.1:4000")
    httpd.serve_forever()

if __name__ == '__main__':
    run_proxy()

