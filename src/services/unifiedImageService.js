import imgurService from './imgurService';
import { imageService } from './imageService';

/**
 * Serviço unificado de upload de imagens com múltiplos fallbacks
 * Ordem de tentativa: Imgur → Servidor Local → Firebase → Base64
 */
class UnifiedImageService {
  constructor() {
    this.uploadMethods = [
      {
        name: 'Imgur',
        method: this.uploadToImgur.bind(this),
        priority: 1
      },
      {
        name: 'Servidor Local',
        method: this.uploadToServer.bind(this),
        priority: 2
      },
      {
        name: 'Firebase',
        method: this.uploadToFirebase.bind(this),
        priority: 3
      },
      {
        name: 'Base64 Local',
        method: this.uploadToBase64.bind(this),
        priority: 4
      }
    ];
  }

  /**
   * Upload principal com fallbacks automáticos
   * @param {File|File[]} files - Arquivo(s) de imagem
   * @returns {Promise<string|string[]>} URL(s) da(s) imagem(ns)
   */
  async uploadImages(files) {
    const isArray = Array.isArray(files);
    const fileArray = isArray ? files : [files];
    
    console.log(`Iniciando upload unificado de ${fileArray.length} imagem(ns)`);
    
    try {
      // Validar arquivos
      this.validateFiles(fileArray);
      
      // Tentar upload com cada método até conseguir
      for (const method of this.uploadMethods) {
        try {
          console.log(`Tentando upload via ${method.name}...`);
          
          const results = await method.method(fileArray);
          
          if (results && results.length > 0) {
            console.log(`✅ Upload bem-sucedido via ${method.name}:`, results);
            return isArray ? results : results[0];
          }
          
        } catch (error) {
          console.warn(`❌ Falha no upload via ${method.name}:`, error.message);
          continue;
        }
      }
      
      throw new Error('Todos os métodos de upload falharam');
      
    } catch (error) {
      console.error('Erro no upload unificado:', error);
      throw error;
    }
  }

  /**
   * Upload via Imgur
   */
  async uploadToImgur(files) {
    try {
      if (files.length === 1) {
        const url = await imgurService.uploadImage(files[0]);
        return [url];
      } else {
        return await imgurService.uploadMultipleImages(files);
      }
    } catch (error) {
      throw new Error(`Imgur: ${error.message}`);
    }
  }

  /**
   * Upload via servidor local
   */
  async uploadToServer(files) {
    try {
      // Implementar upload para servidor local se disponível
      const formData = new FormData();
      files.forEach((file, index) => {
        formData.append(`images[${index}]`, file);
      });
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`Servidor retornou ${response.status}`);
      }
      
      const data = await response.json();
      return data.urls || [];
      
    } catch (error) {
      throw new Error(`Servidor Local: ${error.message}`);
    }
  }

  /**
   * Upload via Firebase
   */
  async uploadToFirebase(files) {
    try {
      const results = [];
      
      for (const file of files) {
        const url = await imageService.uploadImage(file);
        if (url) {
          results.push(url);
        }
      }
      
      if (results.length === 0) {
        throw new Error('Nenhuma imagem foi carregada');
      }
      
      return results;
      
    } catch (error) {
      throw new Error(`Firebase: ${error.message}`);
    }
  }

  /**
   * Upload via Base64 (fallback final)
   */
  async uploadToBase64(files) {
    try {
      const results = [];
      
      for (const file of files) {
        // Comprimir imagem para reduzir tamanho
        const compressedFile = await this.compressForBase64(file);
        const base64 = await this.fileToBase64(compressedFile);
        results.push(base64);
      }
      
      return results;
      
    } catch (error) {
      throw new Error(`Base64: ${error.message}`);
    }
  }

  /**
   * Validar arquivos antes do upload
   */
  validateFiles(files) {
    if (!files || files.length === 0) {
      throw new Error('Nenhum arquivo fornecido');
    }
    
    for (const file of files) {
      if (!file || !file.type) {
        throw new Error('Arquivo inválido');
      }
      
      if (!file.type.startsWith('image/')) {
        throw new Error(`Arquivo deve ser uma imagem: ${file.name}`);
      }
      
      // Limite de 20MB por arquivo
      if (file.size > 20 * 1024 * 1024) {
        throw new Error(`Arquivo muito grande (máximo 20MB): ${file.name}`);
      }
    }
  }

  /**
   * Comprimir imagem para Base64
   */
  async compressForBase64(file, maxWidth = 800, maxHeight = 600, quality = 0.7) {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        let { width, height } = img;
        
        // Calcular dimensões mantendo proporção
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
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob(resolve, 'image/jpeg', quality);
      };
      
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * Converter arquivo para base64
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
   * Upload de imagem única (método de conveniência)
   */
  async uploadSingleImage(file) {
    const results = await this.uploadImages([file]);
    return results[0];
  }

  /**
   * Verificar se URL de imagem é válida
   */
  async validateImageUrl(url) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      return response.ok && response.headers.get('content-type')?.startsWith('image/');
    } catch {
      return false;
    }
  }

  /**
   * Obter informações sobre métodos de upload disponíveis
   */
  getAvailableMethods() {
    return this.uploadMethods.map(method => ({
      name: method.name,
      priority: method.priority
    }));
  }
}

// Instância singleton
const unifiedImageService = new UnifiedImageService();

export default unifiedImageService;

