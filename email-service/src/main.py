from flask import Flask, request, jsonify
from flask_cors import CORS
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
import logging
from datetime import datetime

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Configurações de e-mail (devem ser definidas como variáveis de ambiente)
SMTP_SERVER = os.getenv('SMTP_SERVER', 'smtp.gmail.com')
SMTP_PORT = int(os.getenv('SMTP_PORT', '587'))
EMAIL_USER = os.getenv('EMAIL_USER', 'your-email@gmail.com')
EMAIL_PASSWORD = os.getenv('EMAIL_PASSWORD', 'your-app-password')
APP_URL = os.getenv('APP_URL', 'https://oisozkvz.manus.space')

def send_email(to_emails, subject, html_content):
    """Envia e-mail usando SMTP"""
    try:
        # Criar mensagem
        message = MIMEMultipart("alternative")
        message["Subject"] = subject
        message["From"] = EMAIL_USER
        message["To"] = ", ".join(to_emails)

        # Adicionar conteúdo HTML
        html_part = MIMEText(html_content, "html")
        message.attach(html_part)

        # Criar contexto SSL seguro
        context = ssl.create_default_context()

        # Conectar ao servidor e enviar e-mail
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls(context=context)
            server.login(EMAIL_USER, EMAIL_PASSWORD)
            server.sendmail(EMAIL_USER, to_emails, message.as_string())

        logger.info(f"E-mail enviado com sucesso para: {to_emails}")
        return True

    except Exception as e:
        logger.error(f"Erro ao enviar e-mail: {str(e)}")
        return False

def get_status_info(status):
    """Retorna informações de formatação para cada status"""
    status_map = {
        'aberto': {'text': 'Aberto', 'emoji': '🆕', 'color': '#2563eb'},
        'em_analise': {'text': 'Em Análise', 'emoji': '🔍', 'color': '#f59e0b'},
        'aguardando_aprovacao': {'text': 'Aguardando Aprovação', 'emoji': '⏳', 'color': '#f59e0b'},
        'aprovado': {'text': 'Aprovado', 'emoji': '✅', 'color': '#059669'},
        'rejeitado': {'text': 'Rejeitado', 'emoji': '❌', 'color': '#dc2626'},
        'em_execucao': {'text': 'Em Execução', 'emoji': '🔧', 'color': '#2563eb'},
        'executado_aguardando_validacao': {'text': 'Executado - Aguardando Validação', 'emoji': '✅', 'color': '#059669'},
        'concluido': {'text': 'Concluído', 'emoji': '🎉', 'color': '#059669'},
        'cancelado': {'text': 'Cancelado', 'emoji': '🚫', 'color': '#6b7280'}
    }
    return status_map.get(status, {'text': status, 'emoji': '📋', 'color': '#6b7280'})

@app.route('/health', methods=['GET'])
def health_check():
    """Endpoint de verificação de saúde"""
    return jsonify({
        'status': 'OK',
        'service': 'Email Notification Service',
        'timestamp': datetime.now().isoformat()
    })

@app.route('/send-ticket-created', methods=['POST'])
def send_ticket_created_notification():
    """Envia notificação de chamado criado"""
    try:
        data = request.get_json()
        
        # Validar dados obrigatórios
        required_fields = ['emails', 'ticket', 'project_name']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Campo obrigatório ausente: {field}'}), 400

        emails = data['emails']
        ticket = data['ticket']
        project_name = data['project_name']
        ticket_id = data.get('ticket_id', '')

        # Gerar conteúdo HTML
        priority_color = '#dc2626' if ticket.get('prioridade') == 'urgente' else '#f59e0b' if ticket.get('prioridade') == 'alta' else '#059669'
        
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333; border-bottom: 3px solid #2563eb; padding-bottom: 10px;">🆕 Novo Chamado Criado</h2>
          
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #2563eb;">{ticket.get('titulo', 'Sem título')}</h3>
            <p><strong>📝 Descrição:</strong> {ticket.get('descricao', 'Sem descrição')}</p>
            <p><strong>🏗️ Projeto:</strong> {project_name}</p>
            <p><strong>⚡ Prioridade:</strong> <span style="color: {priority_color}; font-weight: bold;">{ticket.get('prioridade', 'media').upper()}</span></p>
            <p><strong>🎯 Área Responsável:</strong> {ticket.get('area', '').replace('_', ' ').upper()}</p>
            <p><strong>👤 Criado por:</strong> {ticket.get('criadoPorNome', 'Usuário não identificado')}</p>
            <p><strong>📅 Data:</strong> {datetime.now().strftime('%d/%m/%Y às %H:%M')}</p>
            {f'<p style="color: #f59e0b; font-weight: bold;">⚠️ PEDIDO EXTRA</p>' if ticket.get('isExtra') else ''}
          </div>
          
          {f'''
            <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
              <h4 style="margin-top: 0; color: #92400e;">⚠️ Motivo do Pedido Extra:</h4>
              <p>{ticket.get('motivoExtra', '')}</p>
            </div>
          ''' if ticket.get('motivoExtra') else ''}
          
          <div style="margin: 30px 0; text-align: center;">
            <a href="{APP_URL}/chamado/{ticket_id}" 
               style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
              👀 Ver Chamado Completo
            </a>
          </div>
          
          <div style="background-color: #e0f2fe; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #0277bd; font-weight: bold;">
              ⏰ Ação Necessária: Este chamado precisa de atenção da área {ticket.get('area', '').replace('_', ' ').upper()}
            </p>
          </div>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          <p style="color: #6b7280; font-size: 14px; text-align: center;">
            Sistema de Gestão de Chamados - Montagem de Stands<br>
            📧 Este é um e-mail automático, não responda.
          </p>
        </div>
        """

        # Enviar e-mail
        subject = f"🆕 Novo Chamado: {ticket.get('titulo', 'Sem título')}"
        success = send_email(emails, subject, html_content)

        if success:
            return jsonify({'message': 'E-mail enviado com sucesso', 'emails': emails})
        else:
            return jsonify({'error': 'Falha ao enviar e-mail'}), 500

    except Exception as e:
        logger.error(f"Erro no endpoint send-ticket-created: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/send-ticket-updated', methods=['POST'])
def send_ticket_updated_notification():
    """Envia notificação de chamado atualizado"""
    try:
        data = request.get_json()
        
        # Validar dados obrigatórios
        required_fields = ['emails', 'ticket', 'project_name', 'old_status', 'new_status']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Campo obrigatório ausente: {field}'}), 400

        emails = data['emails']
        ticket = data['ticket']
        project_name = data['project_name']
        old_status = data['old_status']
        new_status = data['new_status']
        ticket_id = data.get('ticket_id', '')

        # Obter informações de formatação do status
        old_status_info = get_status_info(old_status)
        new_status_info = get_status_info(new_status)

        # Gerar conteúdo HTML
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333; border-bottom: 3px solid {new_status_info['color']}; padding-bottom: 10px;">
            {new_status_info['emoji']} Status do Chamado Atualizado
          </h2>
          
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #2563eb;">{ticket.get('titulo', 'Sem título')}</h3>
            <p><strong>🏗️ Projeto:</strong> {project_name}</p>
            <p><strong>📊 Status Anterior:</strong> {old_status_info['text']}</p>
            <p><strong>📊 Novo Status:</strong> <span style="color: {new_status_info['color']}; font-weight: bold; background-color: {new_status_info['color']}20; padding: 4px 8px; border-radius: 4px;">{new_status_info['emoji']} {new_status_info['text']}</span></p>
            <p><strong>🎯 Área:</strong> {ticket.get('area', '').replace('_', ' ').upper()}</p>
            <p><strong>📅 Atualizado em:</strong> {datetime.now().strftime('%d/%m/%Y às %H:%M')}</p>
          </div>
          
          {f'''
            <div style="background-color: #dcfce7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #059669;">
              <h4 style="margin-top: 0; color: #166534;">✅ Chamado Executado!</h4>
              <p style="margin: 0;">O chamado foi executado e está aguardando sua validação. Por favor, verifique se o trabalho foi realizado conforme solicitado.</p>
            </div>
          ''' if new_status == 'executado_aguardando_validacao' else ''}
          
          {f'''
            <div style="background-color: #dcfce7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #059669;">
              <h4 style="margin-top: 0; color: #166534;">🎉 Chamado Concluído!</h4>
              <p style="margin: 0;">O chamado foi finalizado com sucesso. Obrigado por utilizar nosso sistema!</p>
            </div>
          ''' if new_status == 'concluido' else ''}
          
          <div style="margin: 30px 0; text-align: center;">
            <a href="{APP_URL}/chamado/{ticket_id}" 
               style="background-color: {new_status_info['color']}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
              👀 Ver Chamado Completo
            </a>
          </div>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          <p style="color: #6b7280; font-size: 14px; text-align: center;">
            Sistema de Gestão de Chamados - Montagem de Stands<br>
            📧 Este é um e-mail automático, não responda.
          </p>
        </div>
        """

        # Enviar e-mail
        subject = f"{new_status_info['emoji']} Chamado Atualizado: {ticket.get('titulo', 'Sem título')}"
        success = send_email(emails, subject, html_content)

        if success:
            return jsonify({'message': 'E-mail enviado com sucesso', 'emails': emails})
        else:
            return jsonify({'error': 'Falha ao enviar e-mail'}), 500

    except Exception as e:
        logger.error(f"Erro no endpoint send-ticket-updated: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/test-email', methods=['POST'])
def test_email():
    """Endpoint para testar envio de e-mail"""
    try:
        data = request.get_json()
        test_email = data.get('email', 'test@example.com')
        
        html_content = """
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">🧪 Teste de E-mail</h2>
          <p>Este é um e-mail de teste do sistema de notificações.</p>
          <p><strong>Data/Hora:</strong> """ + datetime.now().strftime('%d/%m/%Y às %H:%M') + """</p>
          <p>Se você recebeu este e-mail, o sistema está funcionando corretamente!</p>
        </div>
        """
        
        success = send_email([test_email], "🧪 Teste - Sistema de Notificações", html_content)
        
        if success:
            return jsonify({'message': f'E-mail de teste enviado para {test_email}'})
        else:
            return jsonify({'error': 'Falha ao enviar e-mail de teste'}), 500
            
    except Exception as e:
        logger.error(f"Erro no teste de e-mail: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # Verificar configurações
    logger.info(f"Iniciando serviço de e-mail...")
    logger.info(f"SMTP Server: {SMTP_SERVER}:{SMTP_PORT}")
    logger.info(f"Email User: {EMAIL_USER}")
    logger.info(f"App URL: {APP_URL}")
    
    # Iniciar servidor
    app.run(host='0.0.0.0', port=5000, debug=True)

