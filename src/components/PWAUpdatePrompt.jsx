import React, { useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { usePWA } from '../hooks/usePWA';

const PWAUpdatePrompt = () => {
  const { updateAvailable, updateApp } = usePWA();
  const [isVisible, setIsVisible] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  if (!updateAvailable || !isVisible) {
    return null;
  }

  const handleUpdate = () => {
    setIsUpdating(true);
    updateApp();
  };

  const handleDismiss = () => {
    setIsVisible(false);
  };

  return (
    <div className="fixed top-4 left-4 right-4 z-50 md:left-auto md:right-4 md:w-96">
      <Card className="border-green-200 bg-green-50 shadow-lg">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-green-500 rounded-lg">
                <RefreshCw className="h-4 w-4 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-green-900">
                  Atualização Disponível
                </h3>
                <p className="text-sm text-green-700">
                  Nova versão com melhorias e correções
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="text-green-600 hover:text-green-800 hover:bg-green-100 p-1"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex space-x-2 mt-4">
            <Button
              onClick={handleUpdate}
              disabled={isUpdating}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              size="sm"
            >
              {isUpdating ? (
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Atualizando...</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <RefreshCw className="h-4 w-4" />
                  <span>Atualizar</span>
                </div>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={handleDismiss}
              size="sm"
              className="text-green-600 border-green-300 hover:bg-green-100"
            >
              Depois
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PWAUpdatePrompt;

