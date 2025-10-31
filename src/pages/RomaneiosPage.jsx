// src/pages/RomaneiosPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { romaneioService } from "../services/romaneioService";
import { eventService } from "../services/eventService";
import { projectService } from "../services/projectService";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Checkbox } from "../components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { cn } from "../lib/utils";
import { Download, ChevronDown, ExternalLink, Truck } from "lucide-react";
import { Link } from "react-router-dom";

const STATUS_BADGE = {
  agendado: "bg-gray-200 text-gray-800",
  em_carregamento: "bg-amber-200 text-amber-800",
  em_rota: "bg-blue-200 text-blue-800",
  entregue: "bg-emerald-200 text-emerald-800",
  cancelado: "bg-rose-200 text-rose-800",
};

const setoresOptions = ["USET", "SP GROUP", "MOBILIÁRIO", "OPERACIONAL"];
const motivosOptions = ["montagem", "apoio", "extra", "desmontagem", "operacional"];
const veiculosOptions = ["Bau", "Carreta", "HR", "Guincho", "Outros"];
const fornecedorOptions = ["interno", "terceirizado"];
const tiposItensOptions = ["marcenaria", "tapeçaria", "balcões", "comunicação visual", "outros"];

function dateToYMD(d) {
  if (!d) return "";
  const dt = d?.seconds ? new Date(d.seconds * 1000) : new Date(d);
  return isNaN(dt) ? "" : dt.toISOString().slice(0, 10);
}

function toCSV(rows) {
  if (!rows?.length) return "";
  const baseCols = [
    "id","status","dataSaida","fornecedor","placa","tipoVeiculo","motivo",
    "setores","eventNames","projectNames","tiposItens","ticketId","createdAt"
  ];
  const header = baseCols.concat(["itens(categoria)","itens(descricao)","itens(qtd)","itens(pesoKg)","itens(volumeM3)","itens(fragil)"]).join(",");
  const lines = rows.flatMap(r => {
    const common = [
      r.id,
      r.status,
      dateToYMD(r.dataSaida),
      r.fornecedor || "",
      r.placa || "",
      r.tipoVeiculo || "",
      r.motivo || "",
      (r.setores||[]).join("|"),
      (r.eventNames||[]).join("|"),
      (r.projectNames||[]).join("|"),
      (r.tiposItens||[]).join("|"),
      r.ticketId || "",
      r.createdAt?.seconds ? new Date(r.createdAt.seconds*1000).toISOString() : "",
    ];
    if (!r.itens?.length) return [ common.concat(["","","","","",""]).join(",") ];
    return r.itens.map(it => common.concat([
      it.categoria||"",
      '"'+(it.descricao||"").replaceAll('"','""')+'"',
      it.qtd ?? "",
      it.pesoKg ?? "",
      it.volumeM3 ?? "",
      it.fragil ? "sim" : "nao",
    ]).join(","));
  });
  return [header, ...lines].join("\n");
}

function downloadCSV(filename, csv) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function MultiSelect({ label, options, values = [], onChange, placeholder = "Selecionar" }) {
  const [open, setOpen] = useState(false);
  const toggle = (val) => {
    const exists = values.includes(val);
    const next = exists ? values.filter((v) => v !== val) : [...values, val];
    onChange(next);
  };
  return (
    <div className="space-y-1">
      {label && <Label className="text-xs">{label}</Label>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-between">
            <span className="truncate">{values.length ? values.join(", ") : placeholder}</span>
            <ChevronDown className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2">
          <div className="max-h-64 overflow-auto space-y-1">
            {options.map((op) => (
              <button key={op} onClick={() => toggle(op)} className={cn("w-full flex items-center gap-2 rounded px-2 py-1 hover:bg-muted", values.includes(op) && "bg-muted")}>
                <Checkbox checked={values.includes(op)} className="pointer-events-none" />
                <span className="text-sm">{op}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function NovoRomaneioModal({ onCreated }) {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState([]);
  const [projectsByEvent, setProjectsByEvent] = useState({});

  const [eventIds, setEventIds] = useState([]);
  const [projectIds, setProjectIds] = useState([]);
  const [allProjects, setAllProjects] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [setores, setSetores] = useState([]);
  const [tipoVeiculo, setTipoVeiculo] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [placa, setPlaca] = useState("");
  const [dataSaida, setDataSaida] = useState("");
  const [tiposItens, setTiposItens] = useState([]);
  const [itens, setItens] = useState([]);
  const [ticketId, setTicketId] = useState("");

  const isAdmin = profile?.funcao === "administrador";
  const isLogisticaOp = ["gerente", "operador"].includes(profile?.funcao) && profile?.area === "logistica";
  const canCreate = isAdmin || isLogisticaOp;

  useEffect(() => {
    (async () => {
      try {
        const list = await eventService.getActiveEvents?.() || await eventService.listActive?.();
        setEvents(list || []);
      } catch (e) {
        console.error("Erro ao carregar eventos", e);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const map = { ...projectsByEvent };
      for (const evId of eventIds) {
        if (!map[evId]) {
          const projs = (await projectService.getByEventId?.(evId)) || (await projectService.listByEventId?.(evId)) || [];
          map[evId] = projs;
        }
      }
      setProjectsByEvent(map);
    })();
  }, [eventIds.join(",")]);

  const projectOptions = useMemo(() => {
    if (allProjects) return [{ id: "__ALL__", name: "Todos os projetos dos eventos selecionados" }];
    const arr = eventIds.flatMap((id) => projectsByEvent[id] || []);
    const seen = new Set();
    return arr.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  }, [eventIds, projectsByEvent, allProjects]);

  const addItem = () => setItens((prev) => [...prev, { categoria: "", descricao: "", qtd: 1, pesoKg: "", volumeM3: "", fragil: false }]);
  const updateItem = (idx, patch) => setItens((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const removeItem = (idx) => setItens((prev) => prev.filter((_, i) => i !== idx));

  const submit = async () => {
    const selectedEvents = events.filter((e) => eventIds.includes(e.id));
    const selectedProjects = allProjects
      ? eventIds.flatMap((id) => (projectsByEvent[id] || []) )
      : (projectIds.length ? projectOptions.filter((p) => projectIds.includes(p.id)) : []);

    const payload = {
      status: "agendado",
      eventIds: selectedEvents.map((e) => e.id),
      eventNames: selectedEvents.map((e) => e.name || e.titulo || e.nome || "Evento"),
      projectIds: selectedProjects.map((p) => p.id),
      projectNames: selectedProjects.map((p) => p.name || p.titulo || p.nome || "Projeto"),
      motivo,
      setores,
      tipoVeiculo,
      fornecedor,
      placa,
      dataSaida,
      tiposItens,
      itens,
      ticketId: ticketId || null,
      createdBy: user?.uid || null,
    };

    const id = await romaneioService.create(payload);
    setOpen(false);
    onCreated?.(id);

    setEventIds([]); setProjectIds([]); setAllProjects(false); setMotivo(""); setSetores([]); setTipoVeiculo(""); setFornecedor(""); setPlaca(""); setDataSaida(""); setTiposItens([]); setItens([]); setTicketId("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2" disabled={!canCreate}>+ Novo Romaneio</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Novo Romaneio</DialogTitle>
        </DialogHeader>
        <div className="grid md:grid-cols-2 gap-4">
          <MultiSelect label="Eventos (ativos)" options={events.map(e => e.name || e.titulo || e.nome ? `${e.name||e.titulo||e.nome}__${e.id}` : e.id)}
            values={eventIds.map(id => {
              const e = events.find(x=>x.id===id); return e ? `${e.name||e.titulo||e.nome}__${e.id}` : id;
            })}
            onChange={(vals)=>{
              const ids = vals.map(v => (v.split("__").pop()));
              setEventIds(ids); setProjectIds([]); setAllProjects(false);
            }}
            placeholder="Selecione 1 ou mais eventos"
          />

          <div className="space-y-1">
            <Label className="text-xs">Projetos</Label>
            <div className="flex items-center gap-2">
              <Checkbox checked={allProjects} onCheckedChange={(v)=>{ setAllProjects(!!v); setProjectIds([]); }} />
              <span className="text-sm">Todos os projetos dos eventos selecionados</span>
            </div>
            {!allProjects && (
              <MultiSelect
                options={projectOptions.map(p => `${p.name||p.titulo||p.nome||"Projeto"}__${p.id}`)}
                values={projectIds.map(id => {
                  const p = projectOptions.find(x=>x.id===id); return p ? `${p.name||p.titulo||p.nome}__${p.id}` : id;
                })}
                onChange={(vals)=> setProjectIds(vals.map(v=>v.split("__").pop()))}
                placeholder={eventIds.length?"Selecione projeto(s)":"Escolha eventos primeiro"}
              />
            )}
          </div>

          <div>
            <Label className="text-xs">Motivo</Label>
            <Select value={motivo} onValueChange={setMotivo}>
              <SelectTrigger><SelectValue placeholder="Selecionar"/></SelectTrigger>
              <SelectContent>
                {motivosOptions.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <MultiSelect label="Setor responsável" options={setoresOptions} values={setSetores} onChange={setSetores} />

          <div>
            <Label className="text-xs">Tipo de veículo</Label>
            <Select value={tipoVeiculo} onValueChange={setTipoVeiculo}>
              <SelectTrigger><SelectValue placeholder="Selecionar"/></SelectTrigger>
              <SelectContent>
                {veiculosOptions.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Fornecedor</Label>
            <Select value={fornecedor} onValueChange={setFornecedor}>
              <SelectTrigger><SelectValue placeholder="Selecionar"/></SelectTrigger>
              <SelectContent>
                {fornecedorOptions.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Placa</Label>
            <Input value={placa} onChange={(e)=>setPlaca(e.target.value.toUpperCase())} placeholder="ABC1D23" />
          </div>

          <div>
            <Label className="text-xs">Data de saída</Label>
            <Input type="date" value={dataSaida} onChange={(e)=>setDataSaida(e.target.value)} />
          </div>

          <MultiSelect label="Tipos de itens" options={tiposItensOptions} values={tiposItens} onChange={setTiposItens} />

          <div className="md:col-span-2">
            <Label className="text-xs">Vincular a chamado (ID opcional)</Label>
            <Input value={ticketId} onChange={(e)=>setTicketId(e.target.value)} placeholder="ID do chamado (opcional)" />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Itens</h4>
            <Button size="sm" variant="secondary" onClick={addItem}>Adicionar item</Button>
          </div>
          {!itens.length && <p className="text-xs text-muted-foreground">Nenhum item adicionado.</p>}
          <div className="space-y-2 max-h-56 overflow-auto pr-2">
            {itens.map((it, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-end border rounded-lg p-2">
                <div className="col-span-2">
                  <Label className="text-xs">Categoria</Label>
                  <Select value={it.categoria} onValueChange={(v)=>updateItem(idx,{categoria:v})}>
                    <SelectTrigger><SelectValue placeholder="Selecionar"/></SelectTrigger>
                    <SelectContent>
                      {tiposItensOptions.map(op=>(<SelectItem key={op} value={op}>{op}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-5">
                  <Label className="text-xs">Descrição</Label>
                  <Input value={it.descricao} onChange={(e)=>updateItem(idx,{descricao:e.target.value})} placeholder="Ex.: 10 placas MDF 18mm" />
                </div>
                <div className="col-span-1">
                  <Label className="text-xs">Qtd</Label>
                  <Input type="number" min={0} value={it.qtd} onChange={(e)=>updateItem(idx,{qtd:Number(e.target.value)})} />
                </div>
                <div className="col-span-1">
                  <Label className="text-xs">Peso (kg)</Label>
                  <Input type="number" min={0} value={it.pesoKg} onChange={(e)=>updateItem(idx,{pesoKg:e.target.value})} />
                </div>
                <div className="col-span-1">
                  <Label className="text-xs">Vol (m³)</Label>
                  <Input type="number" min={0} step="0.01" value={it.volumeM3} onChange={(e)=>updateItem(idx,{volumeM3:e.target.value})} />
                </div>
                <div className="col-span-1 flex items-center gap-2">
                  <Checkbox checked={it.fragil} onCheckedChange={(v)=>updateItem(idx,{fragil:!!v})} />
                  <Label className="text-xs">Frágil</Label>
                </div>
                <div className="col-span-1 flex justify-end">
                  <Button size="icon" variant="ghost" onClick={()=>removeItem(idx)}>✕</Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={()=>setOpen(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={!eventIds.length || !motivo || !tipoVeiculo || !fornecedor || !dataSaida}>Enviar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RomaneioCard({ data, onToggleEntregue }) {
  const [open, setOpen] = useState(false);
  const chip = (txt, cls) => <span className={cn("px-2 py-0.5 rounded text-xs", cls)}>{txt}</span>;
  return (
    <Card className={cn("rounded-2xl shadow-sm", data.status === "entregue" && "ring-2 ring-emerald-400")}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Truck className="h-4 w-4" /> {data.eventNames?.join(" • ") || "Evento"}
          </CardTitle>
          <Badge className={cn("capitalize", STATUS_BADGE[data.status])}>{data.status.replaceAll("_"," ")}</Badge>
        </div>
        <div className="text-xs text-muted-foreground space-x-2">
          <span>Saída: {dateToYMD(data.dataSaida)}</span>
          <span>• Placa: {data.placa || "-"}</span>
          <span>• Veículo: {data.tipoVeiculo}</span>
          <span>• Motivo: {data.motivo}</span>
          {data.ticketId && (
            <span>• Chamado: <Link className="underline" to={`/chamados/${data.ticketId}`}><ExternalLink className="inline h-3 w-3"/> {data.ticketId}</Link></span>
          )}
        </div>
        <div className="flex flex-wrap gap-1 mt-2">
          {(data.projectNames||[]).slice(0,4).map(p => chip(p, "bg-muted"))}
          {data.projectNames?.length > 4 && chip(`+${data.projectNames.length-4}`, "bg-muted")}
          {(data.setores||[]).map(s => chip(s, "bg-zinc-900 text-white"))}
          {(data.tiposItens||[]).map(t => chip(t, "bg-sky-100 text-sky-700"))}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={()=>setOpen(!open)}>{open?"Ocultar itens":"+ Itens"}</Button>
          <div className="flex items-center gap-2">
            {data.status !== "entregue" ? (
              <Button size="sm" onClick={()=>onToggleEntregue(data.id, true)}>Marcar como entregue</Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={()=>onToggleEntregue(data.id, false)}>Reabrir</Button>
            )}
            <Link to={`/logistica/romaneios/${data.id}/driver`} className="text-xs underline">link motorista</Link>
          </div>
        </div>
        {open && (
          <div className="mt-3 border rounded-lg p-2 max-h-56 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="p-1">Categoria</th>
                  <th className="p-1">Descrição</th>
                  <th className="p-1">Qtd</th>
                  <th className="p-1">Peso (kg)</th>
                  <th className="p-1">Vol (m³)</th>
                  <th className="p-1">Frágil</th>
                </tr>
              </thead>
              <tbody>
                {(data.itens||[]).map((it, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-1 capitalize">{it.categoria}</td>
                    <td className="p-1">{it.descricao}</td>
                    <td className="p-1">{it.qtd}</td>
                    <td className="p-1">{it.pesoKg || "-"}</td>
                    <td className="p-1">{it.volumeM3 || "-"}</td>
                    <td className="p-1">{it.fragil ? "Sim" : "Não"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function RomaneiosPage() {
  const { profile } = useAuth();
  const [tab, setTab] = useState("ativos");
  const [eventoFiltro, setEventoFiltro] = useState("");
  const [eventosAtivos, setEventosAtivos] = useState([]);
  const [ativos, setAtivos] = useState([]);
  const [entregues, setEntregues] = useState([]);

  useEffect(() => {
    (async () => {
      const list = await eventService.getActiveEvents?.() || await eventService.listActive?.();
      setEventosAtivos(list || []);
    })();
  }, []);

  useEffect(() => {
    const unsubA = romaneioService.subscribeList({ eventId: eventoFiltro || undefined, statusArr: ["agendado","em_carregamento","em_rota"], orderDesc: true }, setAtivos);
    const unsubE = romaneioService.subscribeList({ eventId: eventoFiltro || undefined, statusArr: ["entregue"], orderDesc: true }, setEntregues);
    return () => { unsubA && unsubA(); unsubE && unsubE(); };
  }, [eventoFiltro]);

  const onToggleEntregue = async (id, mark) => {
    if (mark) await romaneioService.setDelivered(id); else await romaneioService.setStatus(id, "em_rota");
  };

  const exportar = () => {
    const rows = tab === "ativos" ? ativos : entregues;
    const csv = toCSV(rows);
    downloadCSV(`romaneios_${tab}_${Date.now()}.csv`, csv);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Romaneios</h1>
        <div className="flex items-center gap-2">
          <Select value={eventoFiltro} onValueChange={setEventoFiltro}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Filtrar por evento"/></SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todos os eventos</SelectItem>
              {eventosAtivos.map((e)=> (
                <SelectItem key={e.id} value={e.id}>{e.name || e.titulo || e.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportar} className="gap-2"><Download className="h-4 w-4"/> Exportar CSV</Button>
          <NovoRomaneioModal onCreated={()=>{}}/>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="ativos">Ativos</TabsTrigger>
          <TabsTrigger value="entregues">Entregues</TabsTrigger>
        </TabsList>

        <TabsContent value="ativos" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {ativos.map((r) => (
              <RomaneioCard key={r.id} data={r} onToggleEntregue={onToggleEntregue} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="entregues" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {entregues.map((r) => (
              <RomaneioCard key={r.id} data={r} onToggleEntregue={onToggleEntregue} />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
