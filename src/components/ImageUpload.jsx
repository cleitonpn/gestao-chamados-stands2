import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Camera, 
  Upload, 
  X, 
  Loader2, 
  Image as ImageIcon,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import unifiedImageService from '../services/unifiedImageService';

const ImageUpload = ({ 
  onImagesUploaded, 
  maxImages = 5, 
  multiple = true,
  disabled = false,
  className = "",
  buttonText = "Anexar Imagens",
  showPreview = true,
  existingImages = []
}) => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [previewImages, setPreviewImages] = useState(existingImages);
  const fileInputRef = useRef(null);

  // Função para selecionar arquivos
  const handleFileSelect = async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    // Verificar limite de imagens
    const totalImages = previewImages.length + files.length;
    if (totalImages > maxImages) {
      setError(`Máximo de ${maxImages} imagens permitidas`);
      return;
    }

    await uploadFiles(files);
  };

  // Função principal de upload
  const uploadFiles = async (files) => {
    try {
      setUploading(true);
      setError('');
      setSuccess('');
      setUploadProgress('Preparando upload...');

      console.log('Iniciando upload de', files.length, 'arquivo(s)');

      // Validar arquivos
      for (const file of files) {
        if (!file.type.startsWith('image/')) {
          throw new Error(`Arquivo "${file.name}" não é uma imagem válida`);
        }
        if (file.size > 20 * 1024 * 1024) {
          throw new Error(`Arquivo "${file.name}" é muito grande (máximo 20MB)`);
        }
      }

      setUploadProgress('Fazendo upload das imagens...');

      // Upload usando serviço unificado
      const uploadedUrls = await unifiedImageService.uploadImages(files);

      console.log('Upload concluído:', uploadedUrls);

      // Atualizar preview
      const newImages = [...previewImages, ...uploadedUrls];
      setPreviewImages(newImages);

      // Notificar componente pai
      if (onImagesUploaded) {
        onImagesUploaded(newImages);
      }

      setSuccess(`${uploadedUrls.length} imagem(ns) carregada(s) com sucesso!`);
      
      // Limpar input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

    } catch (error) {
      console.error('Erro no upload:', error);
      setError(error.message || 'Erro ao fazer upload das imagens');
    } finally {
      setUploading(false);
      setUploadProgress('');
    }
  };

  // Função para remover imagem
  const removeImage = (index) => {
    const newImages = previewImages.filter((_, i) => i !== index);
    setPreviewImages(newImages);
    
    if (onImagesUploaded) {
      onImagesUploaded(newImages);
    }
  };

  // Função para abrir seletor de arquivos
  const openFileSelector = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Função para drag and drop
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (disabled || uploading) return;

    const files = Array.from(e.dataTransfer.files).filter(file => 
      file.type.startsWith('image/')
    );

    if (files.length > 0) {
      await uploadFiles(files);
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Botão de Upload */}
      <div className="flex items-center space-x-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={openFileSelector}
          disabled={disabled || uploading || previewImages.length >= maxImages}
          className="flex items-center"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Camera className="h-4 w-4 mr-2" />
          )}
          {uploading ? 'Enviando...' : buttonText}
        </Button>

        {/* Área de Drag and Drop */}
        <div
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className={`
            flex-1 border-2 border-dashed border-gray-300 rounded-lg p-4 text-center
            ${!disabled && !uploading ? 'hover:border-gray-400 cursor-pointer' : 'opacity-50'}
            ${uploading ? 'border-blue-400 bg-blue-50' : ''}
          `}
          onClick={!disabled && !uploading ? openFileSelector : undefined}
        >
          <div className="flex items-center justify-center space-x-2 text-sm text-gray-600">
            <Upload className="h-4 w-4" />
            <span>
              {uploading 
                ? uploadProgress 
                : `Arraste imagens aqui ou clique para selecionar (${previewImages.length}/${maxImages})`
              }
            </span>
          </div>
        </div>
      </div>

      {/* Input de arquivo oculto */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Mensagens de status */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{success}</AlertDescription>
        </Alert>
      )}

      {/* Preview das imagens */}
      {showPreview && previewImages.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">
            Imagens Anexadas ({previewImages.length})
          </label>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {previewImages.map((imageUrl, index) => (
              <div key={index} className="relative group">
                <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
                  <img
                    src={imageUrl}
                    alt={`Imagem ${index + 1}`}
                    className="w-full h-full object-cover cursor-pointer hover:opacity-75 transition-opacity"
                    onClick={() => window.open(imageUrl, '_blank')}
                    onError={(e) => {
                      // Fallback para imagens que não carregam
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'flex';
                    }}
                  />
                  {/* Fallback quando imagem não carrega */}
                  <div className="hidden w-full h-full bg-gray-100 items-center justify-center">
                    <div className="text-center">
                      <ImageIcon className="h-8 w-8 text-gray-400 mx-auto mb-1" />
                      <span className="text-xs text-gray-500">Imagem</span>
                    </div>
                  </div>
                </div>
                
                {/* Botão de remover */}
                {!disabled && (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => removeImage(index)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
                
                {/* Indicador de clique para ampliar */}
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all duration-200 rounded-lg flex items-center justify-center">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="bg-white bg-opacity-90 rounded-full p-1">
                      <ImageIcon className="h-4 w-4 text-gray-700" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Informações sobre métodos de upload */}
      {uploading && (
        <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
          <div className="flex items-center space-x-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Tentando múltiplos métodos de upload para garantir sucesso...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageUpload;

