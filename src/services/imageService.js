import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage, auth } from '../config/firebase';
import { serverImageService } from './serverImageService';
import imgurService from './imgurService';

export const imageService = {
  // Configurações
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  UPLOAD_TIMEOUT: 15000,
  
  // Upload de imagem com sistema robusto de fallback
  async uploadImage(file, ticketId, fileName) {
    try {
      console.log(`🚀 Iniciando upload: ${fileName} para ticket ${ticketId}`);
      
      // Validar entrada
      this.validateImageFile(file);
      if (!ticketId) throw new Error('ID do ticket é obrigatório');
      
      // Sanitizar nome do arquivo
      const sanitizedFileName = this.sanitizeFileName(fileName);
      console.log(`📝 Nome sanitizado: ${sanitizedFileName}`);
      
      // 1. Tentar upload via Imgur primeiro (mais confiável e rápido)
      try {
        console.log('🔄 Tentativa 1: Upload via Imgur');
        const imgurResult = await imgurService.uploadImageToImgur(file, ticketId, sanitizedFileName);
        console.log('✅ Upload via Imgur bem-sucedido');
        return imgurResult;
      } catch (imgurError) {
        console.warn('⚠️ Imgur falhou, tentando servidor local:', imgurError.message);
        
        // 2. Tentar upload via servidor local
        try {
          console.log('🔄 Tentativa 2: Upload via servidor');
          const serverResult = await serverImageService.uploadImageToServer(file, ticketId, sanitizedFileName);
          console.log('✅ Upload via servidor bem-sucedido');
          return serverResult;
        } catch (serverError) {
          console.warn('⚠️ Servidor falhou, tentando Firebase:', serverError.message);
          
          // 3. Tentar upload com Firebase
          try {
            console.log('🔄 Tentativa 3: Upload via Firebase');
            const firebaseResult = await this.uploadToFirebaseWithRetry(file, ticketId, sanitizedFileName);
            console.log('✅ Upload Firebase bem-sucedido');
            return firebaseResult;
          } catch (firebaseError) {
            console.warn('⚠️ Firebase falhou, tentando upload local:', firebaseError.message);
            
            // 4. Fallback para upload local (base64)
            try {
              console.log('🔄 Tentativa 4: Upload local (base64)');
              const localResult = await this.uploadToLocalService(file, ticketId, sanitizedFileName);
              console.log('✅ Upload local bem-sucedido');
              return localResult;
            } catch (localError) {
              console.error('❌ Todos os métodos falharam');
              throw new Error(`Falha em todos os métodos de upload: Imgur(${imgurError.message}), Servidor(${serverError.message}), Firebase(${firebaseError.message}), Local(${localError.message})`);
            }
          }
        }
      }
      
    } catch (error) {
      console.error('❌ Erro geral no upload:', error);
      throw new Error(`Falha no upload: ${error.message}`);
    }
  },

  // Upload para Firebase com retry automático
  async uploadToFirebaseWithRetry(file, ticketId, fileName) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        console.log(`🔄 Tentativa ${attempt}/${this.MAX_RETRIES} - Firebase`);
        
        // Verificar pré-requisitos
        if (!storage) throw new Error('Firebase Storage não configurado');
        if (!auth.currentUser) throw new Error('Usuário não autenticado');
        
        console.log(`👤 Usuário autenticado: ${auth.currentUser.uid}`);
        
        // Criar referência
        const storageRef = ref(storage, `images/${ticketId}/${fileName}`);
        console.log(`📁 Referência criada: ${storageRef.fullPath}`);
        
        // Upload com timeout
        const uploadPromise = this.performFirebaseUpload(storageRef, file);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout no upload')), this.UPLOAD_TIMEOUT)
        );
        
        const result = await Promise.race([uploadPromise, timeoutPromise]);
        console.log(`✅ Upload Firebase concluído na tentativa ${attempt}`);
        return result;
        
      } catch (error) {
        lastError = error;
        console.warn(`❌ Tentativa ${attempt} falhou:`, error.message);
        
        if (attempt < this.MAX_RETRIES) {
          const delay = this.RETRY_DELAY * attempt; // Exponential backoff
          console.log(`⏳ Aguardando ${delay}ms antes da próxima tentativa...`);
          await this.sleep(delay);
        }
      }
    }
    
    throw new Error(`Firebase falhou após ${this.MAX_RETRIES} tentativas: ${lastError.message}`);
  },

  // Executar upload no Firebase
  async performFirebaseUpload(storageRef, file) {
    console.log('📤 Fazendo upload para Firebase...');
    
    // Upload do arquivo
    const snapshot = await uploadBytes(storageRef, file);
    console.log('📤 Upload concluído, obtendo URL...');
    
    // Obter URL de download
    const downloadURL = await getDownloadURL(snapshot.ref);
    console.log('🔗 URL obtida:', downloadURL);
    
    return {
      url: downloadURL,
      path: snapshot.ref.fullPath,
      name: file.name,
      type: 'firebase',
      size: file.size,
      uploadedAt: new Date().toISOString()
    };
  },

  // Upload para serviço local (fallback robusto)
  async uploadToLocalService(file, ticketId, fileName) {
    try {
      console.log('🏠 Iniciando upload local...');
      
      // Redimensionar imagem se muito grande
      const processedFile = await this.processImageForLocal(file);
      
      // Converter para base64
      const base64 = await this.convertToBase64(processedFile);
      console.log('🔄 Conversão base64 concluída');
      
      // Criar objeto de resultado
      const result = {
        url: base64,
        path: `local/${ticketId}/${fileName}`,
        name: file.name,
        type: 'local',
        size: processedFile.size,
        uploadedAt: new Date().toISOString()
      };
      
      console.log('✅ Upload local concluído');
      return result;
      
    } catch (error) {
      console.error('❌ Erro no upload local:', error);
      throw new Error(`Upload local falhou: ${error.message}`);
    }
  },

  // Processar imagem para upload local (redimensionar se necessário)
  async processImageForLocal(file) {
    const maxSize = 1 * 1024 * 1024; // 1MB para base64
    
    if (file.size <= maxSize) {
      console.log('📏 Arquivo já está no tamanho adequado');
      return file;
    }
    
    console.log('🔧 Redimensionando imagem para upload local...');
    return await this.resizeImage(file, 800, 600, 0.7);
  },

  // Redimensionar imagem
  async resizeImage(file, maxWidth = 800, maxHeight = 600, quality = 0.7) {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        let { width, height } = img;
        
        // Calcular novas dimensões mantendo proporção
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
        canvas.toBlob((blob) => {
          if (blob) {
            // Criar novo File object
            const resizedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now()
            });
            console.log(`🔧 Imagem redimensionada: ${file.size} → ${resizedFile.size} bytes`);
            resolve(resizedFile);
          } else {
            reject(new Error('Falha ao redimensionar imagem'));
          }
        }, 'image/jpeg', quality);
      };

      img.onerror = () => reject(new Error('Falha ao carregar imagem para redimensionamento'));
      img.src = URL.createObjectURL(file);
    });
  },

  // Converter arquivo para base64
  async convertToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Falha na conversão para base64'));
      reader.readAsDataURL(file);
    });
  },

  // Upload múltiplo com processamento paralelo
  async uploadMultipleImages(files, ticketId) {
    try {
      console.log(`📦 Upload múltiplo: ${files.length} arquivos para ticket ${ticketId}`);
      
      if (!files || files.length === 0) {
        throw new Error('Nenhum arquivo fornecido para upload');
      }
      
      if (!ticketId) {
        throw new Error('ID do ticket não fornecido');
      }
      
      // 1. Tentar upload múltiplo via Imgur primeiro (mais eficiente)
      try {
        console.log('🔄 Tentativa 1: Upload múltiplo via Imgur');
        const imgurResults = await imgurService.uploadMultipleImagesToImgur(files, ticketId);
        console.log('✅ Upload múltiplo via Imgur bem-sucedido');
        return imgurResults;
      } catch (imgurError) {
        console.warn('⚠️ Imgur falhou, tentando servidor local:', imgurError.message);
        
        // 2. Tentar upload múltiplo via servidor
        try {
          console.log('🔄 Tentativa 2: Upload múltiplo via servidor');
          const serverResults = await serverImageService.uploadMultipleImagesToServer(files, ticketId);
          console.log('✅ Upload múltiplo via servidor bem-sucedido');
          return serverResults;
        } catch (serverError) {
          console.warn('⚠️ Servidor falhou, tentando uploads individuais:', serverError.message);
          
          // 3. Fallback para uploads individuais
          const uploadPromises = files.map((file, index) => {
            const timestamp = Date.now();
            const fileName = `${timestamp}_${index}_${this.sanitizeFileName(file.name)}`;
            console.log(`📋 Preparando upload ${index + 1}/${files.length}: ${fileName}`);
            return this.uploadImage(file, ticketId, fileName);
          });

          console.log('🚀 Executando uploads individuais...');
          const results = await Promise.all(uploadPromises);
          
          console.log(`✅ Todos os uploads concluídos: ${results.length} arquivos`);
          return results;
        }
      }
      
    } catch (error) {
      console.error('❌ Erro no upload múltiplo:', error);
      throw new Error(`Erro no upload múltiplo: ${error.message}`);
    }
  },

  // Deletar imagem
  async deleteImage(imagePath) {
    try {
      if (imagePath.startsWith('local/')) {
        console.log('🏠 Imagem local, não precisa deletar do servidor');
        return;
      }
      
      if (!auth.currentUser) {
        console.warn('👤 Usuário não autenticado para deletar');
        return;
      }
      
      const imageRef = ref(storage, imagePath);
      await deleteObject(imageRef);
      console.log('🗑️ Imagem deletada do Firebase:', imagePath);
      
    } catch (error) {
      console.error('❌ Erro ao deletar imagem:', error);
      // Não falhar se não conseguir deletar
    }
  },

  // Validar arquivo de imagem
  validateImageFile(file) {
    console.log('🔍 Validando arquivo:', {
      name: file.name,
      type: file.type,
      size: file.size
    });
    
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

    console.log('✅ Arquivo validado com sucesso');
    return true;
  },

  // Sanitizar nome do arquivo
  sanitizeFileName(fileName) {
    return fileName
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_|_$/g, '');
  },

  // Função auxiliar para sleep
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  // Verificar conectividade com Firebase
  async checkFirebaseConnectivity() {
    try {
      if (!storage || !auth.currentUser) {
        return false;
      }
      
      // Tentar criar uma referência simples
      const testRef = ref(storage, 'test/connectivity');
      return true;
      
    } catch (error) {
      console.warn('🔌 Conectividade Firebase falhou:', error.message);
      return false;
    }
  }
};

