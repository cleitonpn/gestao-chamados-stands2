// src/pages/RomaneiosPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { romaneioService } from "../services/romaneioService";
import { projectService } from "../services/projectService";
import { db } from "../config/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, Plus, Truck, CheckCircle2, Filter, Send, Link as LinkIcon } from "lucide-react";

function normalize(s) {
  return (s || "").toString().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function tsToDate(ts) {
  try {
    if (!ts) return null;
    if (typeof ts.toDate === "function") return ts.toDate();
    if (ts.seconds) return new Date(ts.seconds * 1000);
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function formatDateBR(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pt-BR");
}

function formatTimeBR(ts) {
  const d = tsToDate(ts);
  if (!d) return "-";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

const motivoOptions = [
  { value: "montagem", label: "Montagem" },
  { value: "apoio", label: "Apoio" },
  { value: "extra", label: "Extra" },
  { value: "desmontagem", label: "Desmontagem" },
  { value: "operacional", label: "Operacional" },
];

const setores = [
  { value: "uset", label: "USET" },
  { value: "sp_group", label: "SP GROUP" },
  { value: "mobiliario", label: "Mobiliário" },
  { value: "operacional", label: "Operacional" },
];

const veiculos = [
  { value: "bau", label: "Baú" },
  { value: "carreta", label: "Carreta" },
  { value: "hr", label: "HR" },
  { value: "guincho", label: "Guincho" },
  { value: "outros", label: "Outros" },
];

const fornecedores = [
  { value: "interno", label: "Interno" },
  { value: "terceirizado", label: "Terceirizado" },
];

const tiposItem = [
  { value: "marcenaria", label: "Marcenaria" },
  { value: "tapecaria", label: "Tapeçaria" },
  { value: "balcoes", label: "Balcões" },
  { value: "comunicacao_visual", label: "Comunicação Visual" },
  { value: "outros", label: "Outros" },
];

export default function RomaneiosPage() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();

  const funcao = normalize(userProfile?.funcao);
  const area = normalize(userProfile?.area);
  const isAdmin = funcao === "administrador" || funcao === "admin";
  const isGerente = funcao === "gerente";
  const isOperadorLog = funcao === "operador" && area === "logistica";

  const [romaneios, setRomaneios] = useState([]);
  const [ativosVisiveis, setAtivosVisiveis] = useState(true);
  const [filtroEvento, setFiltroEvento] = useState("todos");
  const [eventos, setEventos] = useState([]);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    eventoId: undefined,
    eventoNome: "",
    projetoIds: [],
    allProjectsOfEvent: false,
    motivo: undefined,
    setoresResp: [],
    tipoVeiculo: undefined,
    fornecedor: "interno",
    placa: "",
    dataSaida: "", // YYYY-MM-DD
    tiposDeItens: [],
    itensLinhas: [""],
    vincularChamadoId: undefined, // importantíssimo: evitar "" no Select
  });

  const [projetosDoEvento, setProjetosDoEvento] = useState([]);
  const [ticketsLogistica, setTicketsLogistica] = useState([]);
  const canCreate = isAdmin || isGerente || isOperadorLog;

  useEffect(() => {
    (async () => {
      try {
        const qy = query(collection(db, "eventos"), where("ativo", "==", true));
        const snap = await getDocs(qy);
        let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list = list.filter((e) => e.arquivado !== true);
        list.sort((a, b) => (a?.nome || "").localeCompare(b?.nome || "", undefined, { sensitivity: "base" }));
        setEventos(list);
      } catch (e) {
        console.error("[Romaneios] Falha ao carregar eventos:", e);
      }
    })();
  }, []);

  // 🔄 Assinatura em tempo real (troca listenAll → subscribe)
  useEffect(() => {
    const unsubscribe = romaneioService.subscribe(
      {},
      (list) => setRomaneios(list),
      (err) => console.error("[Romaneios] subscribe error:", err)
    );
    return () => {
      try { typeof unsubscribe === "function" && unsubscribe(); } catch {}
    };
  }, []);

  useEffect(() => {
    (async () => {
      if (!form.eventoId) {
        setProjetosDoEvento([]);
        return;
      }
      try {
        let projs = [];
        try {
          projs = await projectService.getProjectsByEvent(form.eventoId);
        } catch {}
        if (!projs || projs.length === 0) {
          const tries = [
            { col: "projetos", field: "eventoId" },
            { col: "projetos", field: "eventId" },
            { col: "projects", field: "eventoId" },
            { col: "projects", field: "eventId" },
          ];
          for (const t of tries) {
            try {
              const qy = query(collection(db, t.col), where(t.field, "==", form.eventoId));
              const snap = await getDocs(qy);
              const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
              if (list.length) { projs = list; break; }
            } catch {}
          }
        }
        projs = (projs || []).sort((a, b) => (a?.nome || "").localeCompare(b?.nome || "", undefined, { sensitivity: "base" }));
        setProjetosDoEvento(projs || []);
      } catch (e) {
        console.error("Falha ao carregar projetos", e);
      }
    })();
  }, [form.eventoId]);

  useEffect(() => {
    (async () => {
      try {
        let list = [];
        const areas = ["logistica", "logística", "Logistica", "Logística"];
        try {
          const qy = query(collection(db, "chamados"), where("areaDestino", "in", areas));
          const snap = await getDocs(qy);
          list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        } catch {}
        if (list.length === 0) {
          try {
            const qy = query(collection(db, "tickets"), where("areaDestino", "in", areas));
            const snap = await getDocs(qy);
            list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          } catch {}
        }
        setTicketsLogistica(list);
      } catch (e) {
        console.error("Falha ao carregar chamados", e);
      }
    })();
  }, [form.eventoId]);

  const eventosOptions = useMemo(
    () => (eventos || []).map(ev => ({ value: ev.id, label: ev.nome || ev.titulo || ev.name || "Evento" })),
    [eventos]
  );

  const ticketsOptions = useMemo(() => {
    let list = [...(ticketsLogistica || [])];
    if (form.eventoId) {
      list = list.filter(t => (t.eventoId || t.eventId) === form.eventoId || (Array.isArray(t.projetoIds) && t.projetoIds.some(Boolean)));
    }
    return list.map(t => ({
      value: t.id,
      label: `${t.titulo || t.title || "Chamado"} — ${t.projetoNome || t.projectName || t.projeto || t.project || ""}`.trim(),
    }));
  }, [ticketsLogistica, form.eventoId]);

  const toggleTipoItem = (val) => {
    setForm((prev) => {
      const set = new Set(prev.tiposDeItens);
      set.has(val) ? set.delete(val) : set.add(val);
      return { ...prev, tiposDeItens: Array.from(set) };
    });
  };

  const toggleSetor = (val) => {
    setForm((prev) => {
      const set = new Set(prev.setoresResp);
      set.has(val) ? set.delete(val) : set.add(val);
      return { ...prev, setoresResp: Array.from(set) };
    });
  };

  const toggleProjeto = (id) => {
    setForm((prev) => {
      const set = new Set(prev.projetoIds);
      set.has(id) ? set.delete(id) : set.add(id);
      return { ...prev, projetoIds: Array.from(set), allProjectsOfEvent: false };
    });
  };

  const addLinhaItem = () => setForm((p) => ({ ...p, itensLinhas: [...p.itensLinhas, ""] }));
  const setLinhaItem = (idx, val) => setForm((p) => {
    const arr = [...p.itensLinhas];
    arr[idx] = val;
    return { ...p, itensLinhas: arr };
  });
  const removeLinhaItem = (idx) => setForm((p) => {
    const arr = p.itensLinhas.filter((_, i) => i !== idx);
    return { ...p, itensLinhas: arr.length ? arr : [""] };
  });

  const limparForm = () => setForm({
    eventoId: undefined,
    eventoNome: "",
    projetoIds: [],
    allProjectsOfEvent: false,
    motivo: undefined,
    setoresResp: [],
    tipoVeiculo: undefined,
    fornecedor: "interno",
    placa: "",
    dataSaida: "",
    tiposDeItens: [],
    itensLinhas: [""],
    vincularChamadoId: undefined,
  });

  const salvar = async () => {
    if (!form.eventoId) return alert("Selecione um evento");
    if (!form.motivo) return alert("Selecione um motivo");
    if (!form.tipoVeiculo) return alert("Selecione o tipo de veículo");
    if (!form.dataSaida) return alert("Informe a DATA de saída");

    setSaving(true);
    try {
      const payload = {
        eventoId: form.eventoId,
        eventoNome: form.eventoNome,
        projetoIds: form.allProjectsOfEvent ? "ALL" : form.projetoIds,
        motivo: form.motivo,
        setoresResp: form.setoresResp,
        tipoVeiculo: form.tipoVeiculo,
        fornecedor: form.fornecedor,
        placa: form.placa.trim(),
        dataSaidaDate: form.dataSaida,
        tiposDeItens: form.tiposDeItens,
        itens: form.itensLinhas.filter((l) => l.trim() !== ""),
        vincularChamadoId: form.vincularChamadoId ?? null,
        status: "ativo",
      };
      await romaneioService.create(payload);
      setOpen(false);
      limparForm();
    } catch (e) {
      console.error("Erro ao salvar romaneio", e);
      alert("Falha ao salvar romaneio. Veja o console.");
    } finally {
      setSaving(false);
    }
  };

  const exportar = async () => {
    try {
      await romaneioService.exportExcel();
    } catch (e) {
      console.error("Export falhou", e);
      alert("Falha ao exportar.");
    }
  };

  // ⏱ carimbar saída agora (novo nome no service)
  const registrarSaida = async (id) => {
    try {
      await romaneioService.markShippedNow(id);
    } catch (e) {
      console.error("Erro ao registrar saída", e);
      alert("Falha ao registrar saída.");
    }
  };

  // 🔗 link do motorista (service já retorna a URL completa)
  const gerarLinkMotorista = async (id) => {
    try {
      const url = await romaneioService.ensureDriverLinkUrl(id);
      await navigator.clipboard.writeText(url);
      alert(`Link copiado:\n${url}`);
    } catch (e) {
      console.error("Erro ao gerar link do motorista", e);
      alert("Falha ao gerar link do motorista.");
    }
  };

  const romaneiosFiltrados = useMemo(() => {
    let base = [...romaneios].sort(
      (a, b) =>
        (new Date(b.createdAt?.seconds ? b.createdAt.seconds * 1000 : b.createdAt || 0)) -
        (new Date(a.createdAt?.seconds ? a.createdAt.seconds * 1000 : a.createdAt || 0))
    );
    if (ativosVisiveis) base = base.filter((r) => r.status !== "entregue");
    if (filtroEvento !== "todos") base = base.filter((r) => r.eventoId === filtroEvento);
    return base;
  }, [romaneios, ativosVisiveis, filtroEvento]);

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Truck className="h-5 w-5" /> Romaneios (Logística)
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportar}>
            <Download className="h-4 w-4 mr-2" />
            Exportar Excel
          </Button>
          {isAdmin || isGerente || isOperadorLog ? (
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Novo romaneio
            </Button>
          ) : null}
        </div>
      </div>

      <Card className="mb-4">
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <Checkbox checked={ativosVisiveis} onCheckedChange={(c) => setAtivosVisiveis(!!c)} id="cb-ativos" />
            <Label htmlFor="cb-ativos">Mostrar apenas ativos</Label>
          </div>

          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-600" />
            <Label className="text-sm text-gray-600">Evento:</Label>
            <Select value={filtroEvento} onValueChange={setFiltroEvento}>
              <SelectTrigger className="h-9 w-56">
                <SelectValue placeholder="Todos os eventos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os eventos</SelectItem>
                {(eventos || []).map((ev) => (
                  <SelectItem key={ev.id} value={ev.id}>{ev.nome || ev.titulo || ev.name || "Evento"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {romaneiosFiltrados.map((r) => (
          <Card key={r.id} className={`${r.status === "entregue" ? "border-green-400" : ""}`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-base">
                Saída (data): {formatDateBR(r.dataSaidaDate)}
                {r.departedAt && <span> — Hora: {formatTimeBR(r.departedAt)}</span>}
              </CardTitle>
              {r.status === "entregue" ? (
                <Badge className="bg-green-600">Entregue</Badge>
              ) : (
                <Badge variant="secondary">Ativo</Badge>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-sm"><b>Evento:</b> {r.eventoNome || r.eventoId}</div>
              <div className="text-sm"><b>Projetos:</b> {Array.isArray(r.projetoIds) ? r.projetoIds.length : "Todos"}</div>
              <div className="text-sm"><b>Motivo:</b> {r.motivo}</div>
              <div className="text-sm"><b>Setor(es):</b> {(r.setoresResp || []).join(", ")}</div>
              <div className="text-sm"><b>Veículo:</b> {r.tipoVeiculo} — Placa: {r.placa || "-"}</div>
              <div className="text-sm"><b>Fornecedor:</b> {r.fornecedor}</div>
              <Separator />
              <details className="text-sm">
                <summary className="cursor-pointer text-gray-700">Itens ({(r.itens || []).length})</summary>
                <ul className="list-disc ml-5 mt-1">
                  {(r.itens || []).map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </details>

              <div className="flex flex-wrap gap-2 mt-2">
                {r.status !== "entregue" && (
                  <Button
                    variant="outline"
                    onClick={() => registrarSaida(r.id)}
                    title="Carimbar hora de saída"
                  >
                    <Send className="h-4 w-4 mr-2" /> Registrar saída
                  </Button>
                )}
                <Button variant="outline" onClick={() => gerarLinkMotorista(r.id)}>
                  <LinkIcon className="h-4 w-4 mr-2" /> Gerar link motorista
                </Button>
                {r.status !== "entregue" && (
                  <Button
                    variant="default"
                    onClick={() => romaneioService.markDelivered(r.id)}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Marcar como entregue
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}

        {romaneiosFiltrados.length === 0 && (
          <Card className="col-span-full">
            <CardContent className="p-8 text-center text-gray-500">
              Nenhum romaneio encontrado com os filtros atuais.
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>Criar romaneio</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Evento</Label>
              <Select
                value={form.eventoId}
                onValueChange={(v) => {
                  const ev = (eventos || []).find(e => e.id === v);
                  setForm((p) => ({ ...p, eventoId: v, eventoNome: ev?.nome || ev?.titulo || ev?.name || "", projetoIds: [], allProjectsOfEvent: false }));
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Selecione um evento" />
                </SelectTrigger>
                <SelectContent>
                  {(eventos || []).map((ev) => (
                    <SelectItem key={ev.id} value={ev.id}>{ev.nome || ev.titulo || ev.name || "Evento"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Motivo</Label>
              <Select value={form.motivo} onValueChange={(v) => setForm((p) => ({ ...p, motivo: v }))}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Escolha o motivo" />
                </SelectTrigger>
                <SelectContent>
                  {motivoOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tipo de veículo</Label>
              <Select value={form.tipoVeiculo} onValueChange={(v) => setForm((p) => ({ ...p, tipoVeiculo: v }))}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Selecione o veículo" />
                </SelectTrigger>
                <SelectContent>
                  {veiculos.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Fornecedor</Label>
              <Select value={form.fornecedor} onValueChange={(v) => setForm((p) => ({ ...p, fornecedor: v }))}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Selecione o fornecedor" />
                </SelectTrigger>
                <SelectContent>
                  {fornecedores.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Placa</Label>
              <Input value={form.placa} onChange={(e) => setForm((p) => ({ ...p, placa: e.target.value }))} placeholder="ABC1D23" />
            </div>

            <div className="space-y-2">
              <Label>Data de saída</Label>
              <Input
                type="date"
                value={form.dataSaida}
                onChange={(e) => setForm((p) => ({ ...p, dataSaida: e.target.value }))}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Projetos do evento</Label>
              <div className="flex items-center gap-2 mb-2">
                <Checkbox
                  id="allproj"
                  checked={form.allProjectsOfEvent}
                  onCheckedChange={(c) => setForm((p) => ({ ...p, allProjectsOfEvent: !!c, projetoIds: [] }))}
                />
                <Label htmlFor="allproj">Selecionar TODOS os projetos deste evento</Label>
              </div>
              {!form.allProjectsOfEvent && (
                <div className="rounded border p-2 max-h-40 overflow-auto space-y-1">
                  {projetosDoEvento.length === 0 && <div className="text-sm text-gray-500">Selecione um evento para listar os projetos.</div>}
                  {projetosDoEvento.map((proj) => (
                    <div key={proj.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`p-${proj.id}`}
                        checked={form.projetoIds.includes(proj.id)}
                        onCheckedChange={() => toggleProjeto(proj.id)}
                      />
                      <Label htmlFor={`p-${proj.id}`} className="text-sm">{proj.nome || proj.titulo || proj.name}</Label>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Setor responsável (múltipla escolha)</Label>
              <div className="flex flex-wrap gap-3">
                {setores.map((s) => (
                  <div key={s.value} className="flex items-center gap-2">
                    <Checkbox
                      id={`s-${s.value}`}
                      checked={form.setoresResp.includes(s.value)}
                      onCheckedChange={() => toggleSetor(s.value)}
                    />
                    <Label htmlFor={`s-${s.value}`}>{s.label}</Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Tipos de itens (múltipla escolha)</Label>
              <div className="flex flex-wrap gap-3">
                {tiposItem.map((t) => (
                  <div key={t.value} className="flex items-center gap-2">
                    <Checkbox
                      id={`t-${t.value}`}
                      checked={form.tiposDeItens.includes(t.value)}
                      onCheckedChange={() => toggleTipoItem(t.value)}
                    />
                    <Label htmlFor={`t-${t.value}`}>{t.label}</Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Itens (linhas estruturadas)</Label>
              <div className="space-y-2">
                {form.itensLinhas.map((linha, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={linha}
                      onChange={(e) => setLinhaItem(idx, e.target.value)}
                      placeholder={`Item ${idx + 1}`}
                    />
                    <Button type="button" variant="ghost" onClick={() => removeLinhaItem(idx)}>Remover</Button>
                  </div>
                ))}
                <Button type="button" variant="secondary" onClick={addLinhaItem}>Adicionar linha</Button>
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Vincular a chamado (opcional)</Label>
              <Select
                value={form.vincularChamadoId ?? undefined}
                onValueChange={(v) => setForm((p) => ({ ...p, vincularChamadoId: v }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Selecione um chamado (Logística)" />
                </SelectTrigger>
                <SelectContent>
                  {ticketsOptions.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={saving}>{saving ? "Salvando..." : "Salvar romaneio"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
