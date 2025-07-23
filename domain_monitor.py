#!/usr/bin/env python3
"""
Script de Monitoramento Automatizado - Domínio Personalizado
Monitora o status do domínio sistemastands.com.br e detecta quando estiver funcionando
"""

import requests
import time
import datetime
import json
import subprocess
import sys
from urllib3.exceptions import InsecureRequestWarning

# Suprimir avisos SSL para testes
requests.urllib3.disable_warnings(InsecureRequestWarning)

class DomainMonitor:
    def __init__(self):
        self.domain = "sistemastands.com.br"
        self.target_urls = [
            f"https://{self.domain}",
            f"http://{self.domain}"
        ]
        self.log_file = "/home/ubuntu/domain_monitor.log"
        self.status_file = "/home/ubuntu/domain_status.json"
        
    def log_message(self, message):
        """Registra mensagem com timestamp"""
        timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        log_entry = f"[{timestamp}] {message}"
        print(log_entry)
        
        try:
            with open(self.log_file, "a", encoding="utf-8") as f:
                f.write(log_entry + "\n")
        except Exception as e:
            print(f"Erro ao escrever log: {e}")
    
    def check_dns_resolution(self):
        """Verifica se o DNS está resolvendo corretamente"""
        try:
            result = subprocess.run(
                ["dig", "+short", self.domain],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0 and result.stdout.strip():
                ips = result.stdout.strip().split('\n')
                return True, ips
            else:
                return False, []
                
        except Exception as e:
            return False, [str(e)]
    
    def check_ssl_certificate(self):
        """Verifica o certificado SSL do domínio"""
        try:
            result = subprocess.run([
                "openssl", "s_client", "-servername", self.domain,
                "-connect", f"{self.domain}:443"
            ], input="", capture_output=True, text=True, timeout=15)
            
            if "CN = sistemastands.com.br" in result.stdout or "CN=sistemastands.com.br" in result.stdout:
                return True, "Certificado específico encontrado"
            elif "CN = *.manusvm.computer" in result.stdout:
                return False, "Certificado wildcard da plataforma"
            else:
                return False, "Certificado não identificado"
                
        except Exception as e:
            return False, f"Erro na verificação SSL: {str(e)}"
    
    def check_http_response(self, url):
        """Verifica resposta HTTP de uma URL"""
        try:
            response = requests.get(
                url,
                timeout=30,
                verify=False,
                allow_redirects=True,
                headers={
                    'User-Agent': 'Mozilla/5.0 (Domain Monitor Bot)',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                }
            )
            
            return {
                'status_code': response.status_code,
                'headers': dict(response.headers),
                'content_length': len(response.content),
                'url': response.url,
                'success': response.status_code == 200
            }
            
        except requests.exceptions.RequestException as e:
            return {
                'status_code': None,
                'error': str(e),
                'success': False
            }
    
    def detect_working_status(self, http_result):
        """Detecta se o domínio está funcionando baseado na resposta HTTP"""
        if not http_result['success']:
            return False, "Erro na conexão HTTP"
        
        # Verifica se retornou página HTML válida
        if http_result['content_length'] > 1000:  # Página com conteúdo substancial
            return True, "Página carregando com conteúdo completo"
        
        # Verifica se não é mais o erro "Invalid host"
        if http_result['status_code'] == 200:
            return True, "Status HTTP 200 - Funcionando"
        
        if http_result['status_code'] == 400:
            return False, "Status HTTP 400 - Invalid host (ainda não configurado)"
        
        return False, f"Status HTTP {http_result['status_code']} - Status indefinido"
    
    def save_status(self, status_data):
        """Salva status atual em arquivo JSON"""
        try:
            with open(self.status_file, "w", encoding="utf-8") as f:
                json.dump(status_data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            self.log_message(f"Erro ao salvar status: {e}")
    
    def run_check(self):
        """Executa verificação completa"""
        self.log_message("=== INICIANDO VERIFICAÇÃO ===")
        
        # Verificar DNS
        dns_ok, dns_ips = self.check_dns_resolution()
        self.log_message(f"DNS Resolution: {'OK' if dns_ok else 'FALHA'} - IPs: {dns_ips}")
        
        # Verificar SSL
        ssl_ok, ssl_info = self.check_ssl_certificate()
        self.log_message(f"SSL Certificate: {'OK' if ssl_ok else 'PENDENTE'} - {ssl_info}")
        
        # Verificar HTTP/HTTPS
        results = {}
        for url in self.target_urls:
            self.log_message(f"Testando: {url}")
            result = self.check_http_response(url)
            results[url] = result
            
            if result['success']:
                working, reason = self.detect_working_status(result)
                self.log_message(f"  Status: {result['status_code']} - {'FUNCIONANDO' if working else 'PENDENTE'} - {reason}")
                
                if working:
                    self.log_message("🎉 DOMÍNIO PERSONALIZADO FUNCIONANDO! 🎉")
                    self.log_message(f"✅ Acesse: {url}")
                    return True
            else:
                self.log_message(f"  Erro: {result.get('error', 'Desconhecido')}")
        
        # Salvar status
        status_data = {
            'timestamp': datetime.datetime.now().isoformat(),
            'dns_resolution': {'ok': dns_ok, 'ips': dns_ips},
            'ssl_certificate': {'ok': ssl_ok, 'info': ssl_info},
            'http_results': results,
            'domain_working': False
        }
        
        self.save_status(status_data)
        self.log_message("=== VERIFICAÇÃO CONCLUÍDA ===\n")
        return False
    
    def monitor_continuous(self, interval_minutes=15):
        """Monitora continuamente com intervalo especificado"""
        self.log_message(f"Iniciando monitoramento contínuo do domínio {self.domain}")
        self.log_message(f"Intervalo: {interval_minutes} minutos")
        
        while True:
            try:
                if self.run_check():
                    self.log_message("Domínio funcionando! Encerrando monitoramento.")
                    break
                
                self.log_message(f"Aguardando {interval_minutes} minutos para próxima verificação...")
                time.sleep(interval_minutes * 60)
                
            except KeyboardInterrupt:
                self.log_message("Monitoramento interrompido pelo usuário.")
                break
            except Exception as e:
                self.log_message(f"Erro durante monitoramento: {e}")
                time.sleep(60)  # Aguarda 1 minuto em caso de erro

def main():
    monitor = DomainMonitor()
    
    if len(sys.argv) > 1:
        if sys.argv[1] == "--continuous":
            interval = int(sys.argv[2]) if len(sys.argv) > 2 else 15
            monitor.monitor_continuous(interval)
        elif sys.argv[1] == "--once":
            monitor.run_check()
        else:
            print("Uso: python3 domain_monitor.py [--once|--continuous [intervalo_minutos]]")
    else:
        # Execução única por padrão
        monitor.run_check()

if __name__ == "__main__":
    main()

