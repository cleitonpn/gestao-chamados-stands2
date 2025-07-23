from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import json
import logging
from datetime import datetime
import os

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Configurações
APP_URL = os.getenv('APP_URL', 'https://ntfqbzvv.manus.space')

class NotificationService:
    """Serviço de notificações alternativo gratuito"""
    
    def __init__(self):
        self.notifications = []  # Armazenar notificações em memória
    
    def add_notification(self, notification_data):
        """Adiciona uma notificação à lista"""
        notification = {
            'id': len(self.notifications) + 1,
            'timestamp': datetime.now().isoformat(),
            'read': False,
            **notification_data
        }
        self.notifications.append(notification)
        logger.info(f"Notificação adicionada: {notification['title']}")
        return notification
    
    def get_notifications(self, user_id=None, area=None, limit=50):
        """Recupera notificações filtradas"""
        filtered = self.notifications
        
        if user_id:
            filtered = [n for n in filtered if n.get('user_id') == user_id]
        
        if area:
            filtered = [n for n in filtered if n.get('area') == area]
        
        # Ordenar por timestamp (mais recentes primeiro)
        filtered.sort(key=lambda x: x['timestamp'], reverse=True)
        
        return filtered[:limit]
    
    def mark_as_read(self, notification_id):
        """Marca notificação como lida"""
        for notification in self.notifications:
            if notification['id'] == notification_id:
                notification['read'] = True
                return True
        return False
    
    def send_webhook_notification(self, webhook_url, data):
        """Envia notificação via webhook (para integração com Discord, Slack, etc.)"""
        try:
            response = requests.post(webhook_url, json=data, timeout=10)
            response.raise_for_status()
            logger.info(f"Webhook enviado com sucesso para {webhook_url}")
            return True
        except Exception as e:
            logger.error(f"Erro ao enviar webhook: {str(e)}")
            return False

# Instância global do serviço
notification_service = NotificationService()

@app.route('/health', methods=['GET'])
def health_check():
    """Endpoint de verificação de saúde"""
    return jsonify({
        'status': 'OK',
        'service': 'Alternative Notification Service',
        'timestamp': datetime.now().isoformat(),
        'total_notifications': len(notification_service.notifications)
    })

@app.route('/notify-ticket-created', methods=['POST'])
def notify_ticket_created():
    """Notifica sobre chamado criado"""
    try:
        data = request.get_json()
        
        # Validar dados obrigatórios
        required_fields = ['ticket', 'project_name']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Campo obrigatório ausente: {field}'}), 400

        ticket = data['ticket']
        project_name = data['project_name']
        ticket_id = data.get('ticket_id', '')
        
        # Criar notificação
        notification_data = {
            'type': 'ticket_created',
            'title': f"🆕 Novo Chamado: {ticket.get('titulo', 'Sem título')}",
            'message': f"Projeto: {project_name} | Área: {ticket.get('area', '').replace('_', ' ').upper()}",
            'priority': ticket.get('prioridade', 'media'),
            'area': ticket.get('area'),
            'ticket_id': ticket_id,
            'project_name': project_name,
            'created_by': ticket.get('criadoPorNome', 'Usuário não identificado'),
            'url': f"{APP_URL}/chamado/{ticket_id}",
            'icon': '🆕',
            'color': '#2563eb'
        }
        
        # Adicionar notificação
        notification = notification_service.add_notification(notification_data)
        
        # Tentar enviar webhook se configurado
        webhook_url = data.get('webhook_url')
        if webhook_url:
            webhook_data = {
                'text': f"🆕 **Novo Chamado Criado**\n\n**{ticket.get('titulo')}**\nProjeto: {project_name}\nÁrea: {ticket.get('area', '').replace('_', ' ').upper()}\nPrioridade: {ticket.get('prioridade', 'media').upper()}\n\n[Ver Chamado]({APP_URL}/chamado/{ticket_id})"
            }
            notification_service.send_webhook_notification(webhook_url, webhook_data)
        
        return jsonify({
            'message': 'Notificação criada com sucesso',
            'notification_id': notification['id'],
            'webhook_sent': bool(webhook_url)
        })

    except Exception as e:
        logger.error(f"Erro ao notificar chamado criado: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/notify-ticket-updated', methods=['POST'])
def notify_ticket_updated():
    """Notifica sobre chamado atualizado"""
    try:
        data = request.get_json()
        
        # Validar dados obrigatórios
        required_fields = ['ticket', 'project_name', 'old_status', 'new_status']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Campo obrigatório ausente: {field}'}), 400

        ticket = data['ticket']
        project_name = data['project_name']
        old_status = data['old_status']
        new_status = data['new_status']
        ticket_id = data.get('ticket_id', '')
        
        # Mapear status para emojis e cores
        status_map = {
            'aberto': {'emoji': '🆕', 'color': '#2563eb', 'text': 'Aberto'},
            'em_analise': {'emoji': '🔍', 'color': '#f59e0b', 'text': 'Em Análise'},
            'em_execucao': {'emoji': '🔧', 'color': '#2563eb', 'text': 'Em Execução'},
            'executado_aguardando_validacao': {'emoji': '✅', 'color': '#059669', 'text': 'Executado - Aguardando Validação'},
            'concluido': {'emoji': '🎉', 'color': '#059669', 'text': 'Concluído'},
            'cancelado': {'emoji': '🚫', 'color': '#6b7280', 'text': 'Cancelado'}
        }
        
        new_status_info = status_map.get(new_status, {'emoji': '📋', 'color': '#6b7280', 'text': new_status})
        
        # Criar notificação
        notification_data = {
            'type': 'ticket_updated',
            'title': f"{new_status_info['emoji']} Chamado Atualizado: {ticket.get('titulo', 'Sem título')}",
            'message': f"Status: {new_status_info['text']} | Projeto: {project_name}",
            'priority': ticket.get('prioridade', 'media'),
            'area': ticket.get('area'),
            'ticket_id': ticket_id,
            'project_name': project_name,
            'old_status': old_status,
            'new_status': new_status,
            'url': f"{APP_URL}/chamado/{ticket_id}",
            'icon': new_status_info['emoji'],
            'color': new_status_info['color']
        }
        
        # Adicionar notificação
        notification = notification_service.add_notification(notification_data)
        
        # Tentar enviar webhook se configurado
        webhook_url = data.get('webhook_url')
        if webhook_url:
            webhook_data = {
                'text': f"{new_status_info['emoji']} **Chamado Atualizado**\n\n**{ticket.get('titulo')}**\nProjeto: {project_name}\nNovo Status: {new_status_info['text']}\nÁrea: {ticket.get('area', '').replace('_', ' ').upper()}\n\n[Ver Chamado]({APP_URL}/chamado/{ticket_id})"
            }
            notification_service.send_webhook_notification(webhook_url, webhook_data)
        
        return jsonify({
            'message': 'Notificação de atualização criada com sucesso',
            'notification_id': notification['id'],
            'webhook_sent': bool(webhook_url)
        })

    except Exception as e:
        logger.error(f"Erro ao notificar atualização: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/notifications', methods=['GET'])
def get_notifications():
    """Recupera notificações"""
    try:
        user_id = request.args.get('user_id')
        area = request.args.get('area')
        limit = int(request.args.get('limit', 50))
        
        notifications = notification_service.get_notifications(user_id, area, limit)
        
        return jsonify({
            'notifications': notifications,
            'total': len(notifications),
            'unread_count': len([n for n in notifications if not n['read']])
        })

    except Exception as e:
        logger.error(f"Erro ao recuperar notificações: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/notifications/<int:notification_id>/read', methods=['POST'])
def mark_notification_read(notification_id):
    """Marca notificação como lida"""
    try:
        success = notification_service.mark_as_read(notification_id)
        
        if success:
            return jsonify({'message': 'Notificação marcada como lida'})
        else:
            return jsonify({'error': 'Notificação não encontrada'}), 404

    except Exception as e:
        logger.error(f"Erro ao marcar notificação como lida: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/test-webhook', methods=['POST'])
def test_webhook():
    """Testa envio de webhook"""
    try:
        data = request.get_json()
        webhook_url = data.get('webhook_url')
        
        if not webhook_url:
            return jsonify({'error': 'webhook_url é obrigatório'}), 400
        
        test_data = {
            'text': f"🧪 **Teste de Webhook**\n\nEste é um teste do sistema de notificações.\nData/Hora: {datetime.now().strftime('%d/%m/%Y às %H:%M')}\n\nSe você recebeu esta mensagem, o webhook está funcionando!"
        }
        
        success = notification_service.send_webhook_notification(webhook_url, test_data)
        
        if success:
            return jsonify({'message': 'Webhook de teste enviado com sucesso'})
        else:
            return jsonify({'error': 'Falha ao enviar webhook de teste'}), 500

    except Exception as e:
        logger.error(f"Erro no teste de webhook: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    logger.info("Iniciando serviço de notificações alternativo...")
    logger.info(f"App URL: {APP_URL}")
    
    # Iniciar servidor
    app.run(host='0.0.0.0', port=5001, debug=True)

