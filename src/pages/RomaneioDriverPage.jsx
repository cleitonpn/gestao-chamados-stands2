// src/pages/RomaneioDriverPage.jsx
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { romaneioService } from "../services/romaneioService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function tsToDate(ts) {
  try {
    if (!ts) return null;
    if (typeof ts.toDate === "function") return ts.toDate();
    if (ts.seconds) return new Date(ts.seconds * 1000);
    return new Date(ts);
  } catch {
    return null;
  }
}

function formatDateTimeBR(ts) {
  const d = tsToDate(ts);
  if (!d) return "-";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function RomaneioDriverPage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [romaneio, setRomaneio] = useState(null);
  const [ok, setOk] = useState(null);

  useEffect(() => {
    (async () => {
      const r = await romaneioService.getByDriverToken(token);
      setRomaneio(r);
      setLoading(false);
    })();
  }, [token]);

  const confirmar = async () => {
    const success = await romaneioService.marcarEntregueByToken(token);
    setOk(success);
    if (success) {
      const r = await romaneioService.getByDriverToken(token);
      setRomaneio(r);
    }
  };

  if (loading) return <div className="p-6">Carregando…</div>;
  if (!romaneio) return <div className="p-6">Link inválido ou romaneio não encontrado.</div>;

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Confirmação de Entrega</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div><b>Evento:</b> {romaneio.eventoNome || romaneio.eventoId}</div>
          <div><b>Status:</b> {romaneio.status}</div>
          <div><b>Data de saída (agendada):</b> {romaneio.dataSaidaDate || "-"}</div>
          <div><b>Saída registrada:</b> {formatDateTimeBR(romaneio.departedAt)}</div>
          <div><b>Entrega registrada:</b> {formatDateTimeBR(romaneio.deliveredAt)}</div>

          {romaneio.status !== "entregue" ? (
            <Button onClick={confirmar}>Confirmar entrega</Button>
          ) : (
            <div className="text-green-700 font-medium">Entrega já confirmada. Obrigado!</div>
          )}
          {ok === false && <div className="text-red-600">Falha ao confirmar. Tente novamente.</div>}
        </CardContent>
      </Card>
    </div>
  );
}
