import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { romaneioService } from "../services/romaneioService";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";

export default function RomaneioDriverPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const d = await romaneioService.getById(id);
      setData(d); setLoading(false);
    })();
  }, [id]);

  const marcarEntregue = async () => {
    await romaneioService.setDelivered(id);
    const d = await romaneioService.getById(id);
    setData(d);
  };

  if (loading) return <div className="p-4">Carregando…</div>;
  if (!data) return <div className="p-4">Romaneio não encontrado.</div>;

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Romaneio #{id.slice(-6)}</CardTitle>
          <div className="text-sm text-muted-foreground">{(data.eventNames||[]).join(" • ")} — saída {data.dataSaida?.seconds ? new Date(data.dataSaida.seconds*1000).toLocaleDateString() : "-"}</div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm">Veículo: <b>{data.tipoVeiculo}</b> — Placa: <b>{data.placa||"-"}</b></div>
          <div className="text-sm">Projetos: {(data.projectNames||[]).join(", ") || "-"}</div>
          <div className="border rounded p-2 max-h-64 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="p-1">Categoria</th>
                  <th className="p-1">Descrição</th>
                  <th className="p-1">Qtd</th>
                </tr>
              </thead>
              <tbody>
                {(data.itens||[]).map((it, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-1 capitalize">{it.categoria}</td>
                    <td className="p-1">{it.descricao}</td>
                    <td className="p-1">{it.qtd}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.status !== "entregue" ? (
            <Button className="w-full" onClick={marcarEntregue}>Marcar como ENTREGUE</Button>
          ) : (
            <div className="text-center text-emerald-700 font-medium">Entregue ✓</div>
          )}
          <div className="text-xs text-center text-muted-foreground">Precisa ajustar? <Link className="underline" to="/logistica/romaneios">Voltar</Link></div>
        </CardContent>
      </Card>
    </div>
  );
}
