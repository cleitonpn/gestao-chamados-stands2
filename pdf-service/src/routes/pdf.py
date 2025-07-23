import os
import tempfile
import subprocess
import time
from flask import Blueprint, request, jsonify, send_file
from werkzeug.utils import secure_filename

pdf_bp = Blueprint('pdf', __name__)

@pdf_bp.route('/generate-pdf', methods=['POST'])
def generate_pdf():
    try:
        data = request.get_json()
        
        if not data or 'markdown' not in data:
            return jsonify({'error': 'Markdown content is required'}), 400
        
        markdown_content = data['markdown']
        filename = data.get('fileName', 'report')
        
        # Criar arquivos temporários com nomes únicos
        timestamp = str(int(time.time()))
        
        md_file_path = f'/tmp/report_{timestamp}.md'
        pdf_file_path = f'/tmp/report_{timestamp}.pdf'
        
        try:
            # Escrever o conteúdo markdown no arquivo
            with open(md_file_path, 'w', encoding='utf-8') as f:
                f.write(markdown_content)
            
            # Verificar se o arquivo markdown foi criado
            if not os.path.exists(md_file_path):
                return jsonify({'error': 'Erro ao criar arquivo markdown temporário'}), 500
            
            # Usar o utilitário manus-md-to-pdf para converter
            result = subprocess.run([
                'manus-md-to-pdf', 
                md_file_path, 
                pdf_file_path
            ], capture_output=True, text=True, timeout=30, cwd='/tmp')
            
            if result.returncode != 0:
                return jsonify({
                    'error': 'Erro na conversão para PDF',
                    'details': result.stderr,
                    'stdout': result.stdout
                }), 500
            
            # Verificar se o arquivo PDF foi criado
            if not os.path.exists(pdf_file_path):
                return jsonify({
                    'error': 'Arquivo PDF não foi gerado',
                    'details': f'Arquivo esperado: {pdf_file_path}',
                    'stdout': result.stdout,
                    'stderr': result.stderr
                }), 500
            
            # Verificar se o arquivo tem conteúdo
            if os.path.getsize(pdf_file_path) == 0:
                return jsonify({'error': 'Arquivo PDF gerado está vazio'}), 500
            
            # Enviar o arquivo PDF
            return send_file(
                pdf_file_path,
                as_attachment=True,
                download_name=f'{filename}.pdf',
                mimetype='application/pdf'
            )
            
        except subprocess.TimeoutExpired:
            return jsonify({'error': 'Timeout na conversão do PDF'}), 500
        except Exception as e:
            return jsonify({
                'error': f'Erro interno na conversão: {str(e)}',
                'type': type(e).__name__
            }), 500
        finally:
            # Limpar arquivos temporários
            try:
                if os.path.exists(md_file_path):
                    os.unlink(md_file_path)
                if os.path.exists(pdf_file_path):
                    # Aguardar um pouco antes de deletar o PDF para garantir que foi enviado
                    import threading
                    def cleanup():
                        time.sleep(10)  # Aguardar 10 segundos
                        try:
                            if os.path.exists(pdf_file_path):
                                os.unlink(pdf_file_path)
                        except:
                            pass
                    threading.Thread(target=cleanup).start()
            except Exception as cleanup_error:
                print(f"Erro na limpeza: {cleanup_error}")
                
    except Exception as e:
        return jsonify({
            'error': f'Erro geral: {str(e)}',
            'type': type(e).__name__
        }), 500

@pdf_bp.route('/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'OK', 'service': 'PDF Conversion Service'})

@pdf_bp.route('/test-pdf', methods=['GET'])
def test_pdf():
    """Endpoint para testar a conversão de PDF"""
    try:
        test_markdown = """# Relatório de Teste

## Informações Básicas
Este é um teste do serviço de conversão de PDF.

### Lista de Itens
- Item 1
- Item 2
- Item 3

**Data:** """ + str(time.time())
        
        timestamp = str(int(time.time()))
        
        md_file_path = f'/tmp/test_{timestamp}.md'
        pdf_file_path = f'/tmp/test_{timestamp}.pdf'
        
        # Escrever arquivo de teste
        with open(md_file_path, 'w', encoding='utf-8') as f:
            f.write(test_markdown)
        
        # Converter para PDF
        result = subprocess.run([
            'manus-md-to-pdf', 
            md_file_path, 
            pdf_file_path
        ], capture_output=True, text=True, timeout=30)
        
        if result.returncode == 0 and os.path.exists(pdf_file_path):
            return send_file(
                pdf_file_path,
                as_attachment=True,
                download_name='teste.pdf',
                mimetype='application/pdf'
            )
        else:
            return jsonify({
                'error': 'Falha no teste',
                'returncode': result.returncode,
                'stdout': result.stdout,
                'stderr': result.stderr
            }), 500
            
    except Exception as e:
        return jsonify({'error': f'Erro no teste: {str(e)}'}), 500

