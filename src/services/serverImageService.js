// Serviço de upload de imagens via servidor local
const UPLOAD_SERVICE_URL = 'https://5002-ivrms29ogihl6su09x5h2-a514ee31.manusvm.computer';

export const serverImageService = {
  // Upload de uma única imagem via servidor
  async uploadImageToServer(file, ticketId, fileName) {
    try {
      console.log(`🚀 Upload via servidor: ${fileName} para ticket ${ticketId}`);
      
      // Validar arquivo
      this.validateImageFile(file);
      
      // Criar FormData
      const formData = new FormData();
      formData.append('file', file);
      
      // Fazer upload
      const response = await fetch(`${UPLOAD_SERVICE_URL}/api/upload-single`, {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Erro HTTP: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('✅ Upload via servidor bem-sucedido:', result);
      
      // Converter para formato compatível
      return {
        url: `${UPLOAD_SERVICE_URL}${result.url}`,
        path: result.filename,
        name: result.original_name,
        type: 'server',
        size: result.size,
        uploadedAt: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('❌ Erro no upload via servidor:', error);
      throw new Error(`Upload via servidor falhou: ${error.message}`);
    }
  },

  // Upload múltiplo via servidor
  async uploadMultipleImagesToServer(files, ticketId) {
    try {
      console.log(`📦 Upload múltiplo via servidor: ${files.length} arquivos para ticket ${ticketId}`);
      
      if (!files || files.length === 0) {
        throw new Error('Nenhum arquivo fornecido para upload');
      }
      
      // Validar todos os arquivos primeiro
      files.forEach((file, index) => {
        try {
          this.validateImageFile(file);
        } catch (error) {
          throw new Error(`Arquivo ${index + 1} (${file.name}): ${error.message}`);
        }
      });
      
      // Criar FormData
      const formData = new FormData();
      files.forEach((file, index) => {
        formData.append('files', file);
      });
      
      // Fazer upload
      const response = await fetch(`${UPLOAD_SERVICE_URL}/api/upload-multiple`, {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Erro HTTP: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('✅ Upload múltiplo via servidor bem-sucedido:', result);
      
      if (!result.success || !result.results || result.results.length === 0) {
        throw new Error('Nenhum arquivo foi enviado com sucesso');
      }
      
      // Converter resultados para formato compatível
      const convertedResults = result.results.map(item => ({
        url: `${UPLOAD_SERVICE_URL}${item.url}`,
        path: item.filename,
        name: item.original_name,
        type: 'server',
        size: item.size,
        uploadedAt: new Date().toISOString()
      }));
      
      console.log(`✅ ${convertedResults.length} arquivos enviados via servidor`);
      
      // Se houve erros, logar mas não falhar
      if (result.errors && result.errors.length > 0) {
        console.warn('⚠️ Alguns arquivos falharam:', result.errors);
      }
      
      return convertedResults;
      
    } catch (error) {
      console.error('❌ Erro no upload múltiplo via servidor:', error);
      throw new Error(`Upload múltiplo via servidor falhou: ${error.message}`);
    }
  },

  // Validar arquivo de imagem
  validateImageFile(file) {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    const maxSize = 10 * 1024 * 1024; // 10MB

    if (!file) {
      throw new Error('Nenhum arquivo fornecido');
    }

    if (!validTypes.includes(file.type)) {
      throw new Error(`Tipo de arquivo não suportado: ${file.type}. Use JPEG, PNG, WebP ou GIF.`);
    }

    if (file.size > maxSize) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      throw new Error(`Arquivo muito grande: ${sizeMB}MB. Tamanho máximo: 10MB.`);
    }

    return true;
  },

  // Testar conectividade com o servidor
  async testServerConnectivity() {
    try {
      const response = await fetch(`${UPLOAD_SERVICE_URL}/api/health`, {
        method: 'GET',
        timeout: 5000
      });
      
      if (!response.ok) {
        throw new Error(`Erro HTTP: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('✅ Servidor de upload disponível:', result);
      return true;
      
    } catch (error) {
      console.warn('⚠️ Servidor de upload não disponível:', error.message);
      return false;
    }
  },

  // Listar uploads do servidor
  async listServerUploads() {
    try {
      const response = await fetch(`${UPLOAD_SERVICE_URL}/api/list-uploads`);
      
      if (!response.ok) {
        throw new Error(`Erro HTTP: ${response.status}`);
      }
      
      const result = await response.json();
      return result.files || [];
      
    } catch (error) {
      console.error('❌ Erro ao listar uploads do servidor:', error);
      return [];
    }
  },

  // Deletar arquivo do servidor
  async deleteServerFile(filename) {
    try {
      const response = await fetch(`${UPLOAD_SERVICE_URL}/api/delete/${filename}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Erro HTTP: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('✅ Arquivo deletado do servidor:', filename);
      return result;
      
    } catch (error) {
      console.error('❌ Erro ao deletar arquivo do servidor:', error);
      throw error;
    }
  }
};

