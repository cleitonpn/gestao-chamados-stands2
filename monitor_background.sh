#!/bin/bash
# Script para monitoramento em background do domínio personalizado

echo "Iniciando monitoramento do domínio sistemastands.com.br..."
echo "Logs salvos em: /home/ubuntu/domain_monitor.log"
echo "Status salvo em: /home/ubuntu/domain_status.json"

# Executar monitoramento contínuo em background
nohup python3 /home/ubuntu/gestao-chamados-stands/domain_monitor.py --continuous 30 > /dev/null 2>&1 &

echo "Monitoramento iniciado em background (PID: $!)"
echo "Para parar: pkill -f domain_monitor.py"
echo "Para ver logs: tail -f /home/ubuntu/domain_monitor.log"

