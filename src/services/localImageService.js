// Serviço de imagem local como fallback para o Firebase Storage
export const localImageService = {
  // Converter imagem para base64 para armazenamento local
  async convertToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  // Upload de imagem usando base64 (fallback)
  async uploadImageLocal(file, ticketId, fileName) {
    try {
      console.log(`Upload local: ${fileName} para ticket ${ticketId}`);
      
      // Validar arquivo
      this.validateImageFile(file);
      
      // Converter para base64
      const base64 = await this.convertToBase64(file);
      
      // Simular estrutura similar ao Firebase
      const imageData = {
        url: base64,
        path: `local/${ticketId}/${fileName}`,
        name: fileName,
        type: 'base64',
        uploadedAt: new Date().toISOString()
      };
      
      console.log('Upload local concluído:', fileName);
      return imageData;
    } catch (error) {
      console.error('Erro no upload local:', error);
      throw error;
    }
  },

  // Upload múltiplo local
  async uploadMultipleImagesLocal(files, ticketId) {
    try {
      console.log(`Upload múltiplo local: ${files.length} arquivos`);
      
      const uploadPromises = files.map((file, index) => {
        const fileName = `${Date.now()}_${index}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        return this.uploadImageLocal(file, ticketId, fileName);
      });

      const results = await Promise.all(uploadPromises);
      console.log('Todos os uploads locais concluídos');
      return results;
    } catch (error) {
      console.error('Erro no upload múltiplo local:', error);
      throw error;
    }
  },

  // Validar arquivo de imagem
  validateImageFile(file) {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    const maxSize = 2 * 1024 * 1024; // 2MB para base64

    if (!file) {
      throw new Error('Nenhum arquivo fornecido');
    }

    if (!validTypes.includes(file.type)) {
      throw new Error(`Tipo de arquivo não suportado: ${file.type}`);
    }

    if (file.size > maxSize) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      throw new Error(`Arquivo muito grande: ${sizeMB}MB. Máximo: 2MB para upload local.`);
    }

    return true;
  },

  // Redimensionar imagem para reduzir tamanho
  async resizeImage(file, maxWidth = 800, maxHeight = 600, quality = 0.7) {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        let { width, height } = img;
        
        // Calcular novas dimensões
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        if (height > maxHeight) {
          width = (width * maxHeight) / height;
          height = maxHeight;
        }

        canvas.width = width;
        canvas.height = height;

        // Desenhar imagem redimensionada
        ctx.drawImage(img, 0, 0, width, height);

        // Converter para blob
        canvas.toBlob(resolve, 'image/jpeg', quality);
      };

      img.src = URL.createObjectURL(file);
    });
  }
};

