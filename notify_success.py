#!/usr/bin/env python3
"""
Script de Notificação - Domínio Personalizado Ativo
Executa ações quando o domínio personalizado estiver funcionando
"""

import json
import datetime
import os

def create_success_notification():
    """Cria arquivo de notificação de sucesso"""
    
    success_data = {
        'timestamp': datetime.datetime.now().isoformat(),
        'domain': 'sistemastands.com.br',
        'status': 'FUNCIONANDO',
        'message': 'Domínio personalizado ativado com sucesso!',
        'urls': [
            'https://sistemastands.com.br',
            'https://www.sistemastands.com.br'
        ],
        'next_steps': [
            'Testar todas as funcionalidades do sistema',
            'Verificar certificado SSL',
            'Comunicar nova URL para usuários',
            'Atualizar documentação e links'
        ]
    }
    
    # Salvar notificação
    with open('/home/ubuntu/DOMINIO_ATIVO.json', 'w', encoding='utf-8') as f:
        json.dump(success_data, f, indent=2, ensure_ascii=False)
    
    # Criar arquivo de texto legível
    with open('/home/ubuntu/DOMINIO_ATIVO.txt', 'w', encoding='utf-8') as f:
        f.write("🎉 DOMÍNIO PERSONALIZADO ATIVO! 🎉\n")
        f.write("=" * 50 + "\n\n")
        f.write(f"Data/Hora: {success_data['timestamp']}\n")
        f.write(f"Domínio: {success_data['domain']}\n")
        f.write(f"Status: {success_data['status']}\n\n")
        f.write("URLs Ativas:\n")
        for url in success_data['urls']:
            f.write(f"  ✅ {url}\n")
        f.write("\nPróximos Passos:\n")
        for step in success_data['next_steps']:
            f.write(f"  📋 {step}\n")
    
    print("✅ Arquivos de notificação criados:")
    print("  - /home/ubuntu/DOMINIO_ATIVO.json")
    print("  - /home/ubuntu/DOMINIO_ATIVO.txt")

if __name__ == "__main__":
    create_success_notification()

