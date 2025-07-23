import React, { useState } from 'react';
import { Download, X, Smartphone, Monitor } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { usePWA } from '../hooks/usePWA';

const PWAInstallPrompt = () => {
  const { isInstallable, installApp } = usePWA();
  const [isVisible, setIsVisible] = useState(true);
  const [isInstalling, setIsInstalling] = useState(false);

  if (!isInstallable || !isVisible) {
    return null;
  }

  const handleInstall = async () => {
    setIsInstalling(true);
    const success = await installApp();
    
    if (success) {
      setIsVisible(false);
    }
    
    setIsInstalling(false);
  };

  const handleDismiss = () => {
    setIsVisible(false);
    // Remember user dismissed for this session
    sessionStorage.setItem('pwa-install-dismissed', 'true');
  };

  // Don't show if user already dismissed this session
  if (sessionStorage.getItem('pwa-install-dismissed')) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:w-96">
      <Card className="border-blue-200 bg-blue-50 shadow-lg">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-blue-500 rounded-lg">
                <Download className="h-4 w-4 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-blue-900">
                  Instalar App
                </h3>
                <p className="text-sm text-blue-700">
                  Acesse rapidamente do seu dispositivo
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="text-blue-600 hover:text-blue-800 hover:bg-blue-100 p-1"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center space-x-3 text-sm text-blue-700">
              <Smartphone className="h-4 w-4" />
              <span>Acesso offline</span>
            </div>
            <div className="flex items-center space-x-3 text-sm text-blue-700">
              <Monitor className="h-4 w-4" />
              <span>Interface nativa</span>
            </div>
          </div>

          <div className="flex space-x-2 mt-4">
            <Button
              onClick={handleInstall}
              disabled={isInstalling}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              size="sm"
            >
              {isInstalling ? (
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Instalando...</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <Download className="h-4 w-4" />
                  <span>Instalar</span>
                </div>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={handleDismiss}
              size="sm"
              className="text-blue-600 border-blue-300 hover:bg-blue-100"
            >
              Agora não
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PWAInstallPrompt;

