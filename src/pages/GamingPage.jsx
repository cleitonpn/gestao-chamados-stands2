import React, { useEffect, useMemo, useState } from 'react';
import Header from '@/components/Header';
import { useAuth } from '@/contexts/AuthContext';
import { gamificationService } from '@/services/gamificationService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Trophy, Medal, Award, Loader2, User } from 'lucide-react';

const PeriodPicker = ({ value, onChange }) => (
  <Select value={String(value)} onValueChange={v => onChange(v === 'all' ? 'all' : Number(v))}>
    <SelectTrigger className="w-48">
      <SelectValue placeholder="Período" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="7">Últimos 7 dias</SelectItem>
      <SelectItem value="30">Últimos 30 dias</SelectItem>
      <SelectItem value="90">Últimos 90 dias</SelectItem>
      <SelectItem value="365">Últimos 12 meses</SelectItem>
      <SelectItem value="all">Todo o histórico</SelectItem>
    </SelectContent>
  </Select>
);

const PodiumCard = ({ place, user, highlight }) => {
  const Icon = place === 1 ? Trophy : place === 2 ? Medal : Award;
  const placeColors = place === 1
    ? 'bg-yellow-100 text-yellow-800'
    : place === 2
      ? 'bg-gray-100 text-gray-800'
      : 'bg-amber-100 text-amber-800';

  if (!user) return null;
  return (
    <Card className={`${highlight ? 'ring-2 ring-blue-500' : ''}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Icon className="h-5 w-5" />
          {place === 1 ? '1º lugar' : place === 2 ? '2º lugar' : '3º lugar'}
        </CardTitle>
        <Badge className={placeColors}>{user.score} pts</Badge>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold flex items-center gap-2">
          <User className="h-6 w-6" /> {user.nome}
        </div>
        <p className="text-xs text-muted-foreground capitalize">{user.funcao}</p>
        <div className="mt-3 text-xs text-muted-foreground flex gap-3">
          <span>Chamados: <b>{user.tickets}</b></span>
          <span>Mensagens: <b>{user.messages}</b></span>
          <span>Diário: <b>{user.diary}</b></span>
        </div>
      </CardContent>
    </Card>
  );
};

const GamingPage = () => {
  const { user, userProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(30);
  const [data, setData] = useState({ rows: [], weights: { ticket: 3, message: 1, diary: 2 } });

  const currentUserId = userProfile?.id || user?.uid;

  const load = async (days) => {
    setLoading(true);
    try {
      const res = await gamificationService.getLeaderboard({ days });
      setData(res);
    } catch (e) {
      console.error('Erro ao carregar leaderboard:', e);
      setData({ rows: [], weights: { ticket: 3, message: 1, diary: 2 } });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(period); }, []); // primeira carga
  useEffect(() => { load(period); }, [period]); // quando trocar de período

  const podium = useMemo(() => data.rows.slice(0, 3), [data.rows]);
  const myRankIndex = useMemo(
    () => data.rows.findIndex(r => r.userId === currentUserId),
    [data.rows, currentUserId]
  );
  const myRank = myRankIndex >= 0 ? myRankIndex + 1 : null;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Gamificação</h1>
            <p className="text-sm text-muted-foreground">
              Ranking de interações (Chamados, Mensagens e Diário). Pesos: chamado {data.weights.ticket} • mensagem {data.weights.message} • diário {data.weights.diary}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <PeriodPicker value={period} onChange={setPeriod} />
            <Button variant="outline" onClick={() => load(period)} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Atualizar
            </Button>
          </div>
        </div>

        {/* Podium */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <PodiumCard place={1} user={podium[0]} highlight={podium[0]?.userId === currentUserId} />
          <PodiumCard place={2} user={podium[1]} highlight={podium[1]?.userId === currentUserId} />
          <PodiumCard place={3} user={podium[2]} highlight={podium[2]?.userId === currentUserId} />
        </div>

        {/* Minha posição */}
        {myRank && (
          <Card className="mb-6">
            <CardContent className="py-4 text-sm">
              Você está em <b>{myRank}º</b> com <b>{data.rows[myRankIndex].score}</b> pontos
              (Chamados: {data.rows[myRankIndex].tickets} • Mensagens: {data.rows[myRankIndex].messages} • Diário: {data.rows[myRankIndex].diary}).
            </CardContent>
          </Card>
        )}

        {/* Tabela */}
        <Card>
          <CardHeader>
            <CardTitle>Ranking completo</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableCaption>Interações {period === 'all' ? 'de todo o histórico' : `dos últimos ${period} dias`}</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Função</TableHead>
                  <TableHead className="text-right">Chamados</TableHead>
                  <TableHead className="text-right">Mensagens</TableHead>
                  <TableHead className="text-right">Diário</TableHead>
                  <TableHead className="text-right">Pontuação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      <Loader2 className="h-4 w-4 mr-2 inline animate-spin" />
                      Carregando ranking…
                    </TableCell>
                  </TableRow>
                ) : data.rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nenhuma interação encontrada no período.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.rows.map((r, idx) => (
                    <TableRow key={r.userId} className={r.userId === currentUserId ? 'bg-blue-50/40' : ''}>
                      <TableCell className="font-medium">{idx + 1}</TableCell>
                      <TableCell>{r.nome}</TableCell>
                      <TableCell className="capitalize">{r.funcao}</TableCell>
                      <TableCell className="text-right">{r.tickets}</TableCell>
                      <TableCell className="text-right">{r.messages}</TableCell>
                      <TableCell className="text-right">{r.diary}</TableCell>
                      <TableCell className="text-right font-semibold">{r.score}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default GamingPage;
