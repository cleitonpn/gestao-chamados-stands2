import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, LogIn } from 'lucide-react';

function normalize(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // agora também usamos currentUser para tentar ler custom claims no fallback
  const { login, userProfile, fetchUserProfile, currentUser } = useAuth();
  const navigate = useNavigate();

  const pickRoleFromObject = (obj) => {
    if (!obj) return '';
    const keys = ['funcao', 'role', 'area', 'perfil', 'papel', 'tipo'];
    for (const k of keys) {
      const v = obj?.[k];
      if (v) return normalize(v);
    }
    return '';
  };

  // decide destino com base em várias fontes
  const resolveUserRole = async () => {
    try {
      // 1) Tenta carregar perfil via contexto
      const profile = (await (fetchUserProfile?.())) || userProfile || {};
      let role = pickRoleFromObject(profile);

      // 2) Fallback: tenta custom claims do token
      if (!role) {
        try {
          // após login o currentUser deve existir
          const tokenResult = await currentUser?.getIdTokenResult?.();
          const claimsRole = tokenResult?.claims?.role || tokenResult?.claims?.funcao || tokenResult?.claims?.area;
          role = normalize(claimsRole || '');
        } catch (_) {
          // ignora
        }
      }

      // 3) Último fallback: nada encontrado
      return role || '';
    } catch {
      return '';
    }
  };

  const goByRole = (role) => {
    const r = normalize(role);
    const isEmpreiteiro =
      r === 'empreiteiro' ||
      r === 'empreiteira' ||
      r === 'contractor';

    if (isEmpreiteiro) {
      navigate('/empreiteiro');
    } else {
      navigate('/dashboard');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email || !password) {
      setError('Por favor, preencha todos os campos');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await login(email, password);

      const role = await resolveUserRole();
      // Log leve para debug local (pode remover depois)
      console.log('[Login] Role detectada:', role || '(vazia)');
      goByRole(role);
    } catch (error) {
      console.error('Erro no login:', error);
      switch (error.code) {
        case 'auth/user-not-found':
          setError('Usuário não encontrado');
          break;
        case 'auth/wrong-password':
          setError('Senha incorreta');
          break;
        case 'auth/invalid-email':
          setError('Email inválido');
          break;
        case 'auth/too-many-requests':
          setError('Muitas tentativas de login. Tente novamente mais tarde');
          break;
        default:
          setError('Erro ao fazer login. Tente novamente');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <LogIn className="h-8 w-8 text-blue-600" />
          </div>
          <CardTitle className="text-2xl text-center">
            Gestão de Chamados
          </CardTitle>
          <CardDescription className="text-center">
            Faça login para acessar o sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="Sua senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Entrando...
                </>
              ) : (
                'Entrar'
              )}
            </Button>

            <p className="text-center text-xs text-gray-500 mt-2">
              Perfis <strong>empreiteiro</strong> são direcionados ao painel exclusivo automaticamente.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default LoginPage;
