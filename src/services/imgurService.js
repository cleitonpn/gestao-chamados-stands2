// Serviço para upload de imagens via Imgur API
class ImgurService {
  constructor() {
    // Client ID público do Imgur (pode ser usado sem autenticação para uploads anônimos)
    this.clientId = '546c25a59c58ad7';
    this.apiUrl = 'https://api.imgur.com/3/image';
  }

  /**
   * Faz upload de uma imagem para o Imgur
   * @param {File|Blob} file - Arquivo de imagem
   * @returns {Promise<string>} URL da imagem no Imgur
   */
  async uploadImage(file) {
    try {
      console.log('Iniciando upload para Imgur:', file.name, file.size);
      
      // Validar arquivo
      if (!file) {
        throw new Error('Arquivo não fornecido');
      }
      
      if (!file.type.startsWith('image/')) {
        throw new Error('Arquivo deve ser uma imagem');
      }
      
      // Limite de 10MB para Imgur
      if (file.size > 10 * 1024 * 1024) {
        throw new Error('Arquivo muito grande (máximo 10MB)');
      }
      
      // Converter para base64
      const base64 = await this.fileToBase64(file);
      
      // Preparar dados para upload
      const formData = new FormData();
      formData.append('image', base64.split(',')[1]); // Remove o prefixo data:image/...;base64,
      formData.append('type', 'base64');
      
      // Fazer upload
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Client-ID ${this.clientId}`,
        },
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Erro no upload: ${response.status} - ${errorData.data?.error || response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(`Upload falhou: ${data.data?.error || 'Erro desconhecido'}`);
      }
      
      const imageUrl = data.data.link;
      console.log('Upload para Imgur bem-sucedido:', imageUrl);
      
      return imageUrl;
      
    } catch (error) {
      console.error('Erro no upload para Imgur:', error);
      throw error;
    }
  }

  /**
   * Faz upload de múltiplas imagens
   * @param {File[]} files - Array de arquivos de imagem
   * @returns {Promise<string[]>} Array de URLs das imagens
   */
  async uploadMultipleImages(files) {
    try {
      console.log(`Iniciando upload de ${files.length} imagens para Imgur`);
      
      const uploadPromises = files.map(file => this.uploadImage(file));
      const results = await Promise.allSettled(uploadPromises);
      
      const successfulUploads = [];
      const errors = [];
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successfulUploads.push(result.value);
        } else {
          errors.push(`Arquivo ${index + 1}: ${result.reason.message}`);
        }
      });
      
      if (errors.length > 0) {
        console.warn('Alguns uploads falharam:', errors);
      }
      
      console.log(`Upload concluído: ${successfulUploads.length}/${files.length} imagens`);
      return successfulUploads;
      
    } catch (error) {
      console.error('Erro no upload múltiplo para Imgur:', error);
      throw error;
    }
  }

  /**
   * Converte arquivo para base64
   * @param {File} file - Arquivo a ser convertido
   * @returns {Promise<string>} String base64
   */
  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * Comprime imagem se necessário
   * @param {File} file - Arquivo de imagem
   * @param {number} maxWidth - Largura máxima
   * @param {number} maxHeight - Altura máxima
   * @param {number} quality - Qualidade (0-1)
   * @returns {Promise<Blob>} Imagem comprimida
   */
  async compressImage(file, maxWidth = 1920, maxHeight = 1080, quality = 0.8) {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        // Calcular dimensões mantendo proporção
        let { width, height } = img;
        
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        if (height > maxHeight) {
          width = (width * maxHeight) / height;
          height = maxHeight;
        }
        
        // Redimensionar
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        
        // Converter para blob
        canvas.toBlob(resolve, file.type, quality);
      };
      
      img.src = URL.createObjectURL(file);
    });
  }
}

// Instância singleton
const imgurService = new ImgurService();

export default imgurService;

