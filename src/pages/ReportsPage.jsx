
import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Download } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

// Serviços (ajuste os caminhos, se necessário)
import { projectService } from "../services/projectService";
import { ticketService } from "../services/ticketService";
import { userService } from "../services/userService";

/**
 * ReportsPage — versão com filtros extras e gráficos reativos
 * - Filtros: origem, executora, tipo, área atual, atribuído a, busca (#id)
 * - Exporta 1 linha por chamado (agregando campos específicos)
 * - Gráficos reagem aos filtros atuais
 */

export default function ReportsPage() {
  // ---------- Dados base ----------
  const [projects, setProjects] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ---------- Filtros ----------
  const [searchTerm, setSearchTerm] = useState("");
  const [exportFormat, setExportFormat] = useState("xlsx"); // 'xlsx' | 'csv'
  const [filterAreaOrigin, setFilterAreaOrigin] = useState("all");
  const [filterAreaExecuted, setFilterAreaExecuted] = useState("all");
  const [filterTicketType, setFilterTicketType] = useState("all");
  const [filterAreaAtual, setFilterAreaAtual] = useState("all");
  const [filterAtribuido, setFilterAtribuido] = useState("all");

  // ---------- Carregamento ----------
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        setLoading(true);
        const [p, t, u] = await Promise.all([
          projectService.getAllProjects?.() ?? [],
          ticketService.getAllTickets?.() ?? [],
          userService.getAllUsers?.() ?? [],
        ]);
        if (!alive) return;
        setProjects(Array.isArray(p) ? p : []);
        setTickets(Array.isArray(t) ? t : []);
        setAllUsers(Array.isArray(u) ? u : []);
      } catch (e) {
        console.error(e);
        if (alive) setError("Falha ao carregar dados de relatórios.");
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => { alive = false; };
  }, []);

  // ---------- Helpers ----------
  const fmtDate = (d) => {
    try {
      const dt = d?.toDate ? d.toDate() : d;
      if (!dt) return "";
      return new Date(dt).toLocaleString("pt-BR");
    } catch { return ""; }
  };

  const findUser = (id) => {
    if (!id) return null;
    return allUsers.find(u => u.id === id || u.uid === id);
  };

  const getUserName = (id) => (findUser(id)?.nome) || "";

  const getExecutedArea = (ticket) => {
    const isClosed = ["concluido", "arquivado"].includes(ticket?.status);
    const resolvedById = ticket?.resolvidoPor || ticket?.concluídoPor || ticket?.finalizadoPor || (isClosed ? ticket?.atribuidoA : null);
    const user = findUser(resolvedById);
    return user?.area || null;
  };

  const getExecutedByName = (ticket) => {
    const isClosed = ["concluido", "arquivado"].includes(ticket?.status);
    const resolvedById = ticket?.resolvidoPor || ticket?.concluídoPor || ticket?.finalizadoPor || (isClosed ? ticket?.atribuidoA : null);
    return getUserName(resolvedById);
  };

  // Opções de selects
  const AREA_LIST = useMemo(() => {
    const fromUsers = Array.from(new Set((allUsers || []).map(u => u?.area).filter(Boolean)));
    const fromTickets = Array.from(new Set((tickets || []).flatMap(t => [t?.areaDeOrigem, t?.areaInicial, t?.area]).filter(Boolean)));
    return Array.from(new Set([...fromUsers, ...fromTickets])).sort();
  }, [allUsers, tickets]);

  const TIPO_LIST = useMemo(() => {
    return Array.from(new Set((tickets || []).map(t => t?.tipo).filter(Boolean))).sort();
  }, [tickets]);

  const ATRIBUIDO_LIST = useMemo(() => {
    return (allUsers || [])
      .map(u => ({ id: u.id || u.uid, nome: u.nome || u.displayName || u.email || "(sem nome)" }))
      .filter(x => !!x.id)
      .sort((a,b) => a.nome.localeCompare(b.nome));
  }, [allUsers]);

  // ---------- Busca + filtros ----------
  const norm = (s) => (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const searchTermNorm = norm(searchTerm);
  const idCandidate = (searchTerm || "").trim().replace(/^#/, "").toLowerCase();
  const looksLikeId = (searchTerm || "").startsWith("#") || (/^[A-Za-z0-9_-]{6,}$/.test(idCandidate));

  const filteredTickets = useMemo(() => {
    let list = [...tickets];

    if (filterAreaOrigin !== "all") {
      list = list.filter(t => (t?.areaDeOrigem || t?.areaInicial) === filterAreaOrigin);
    }
    if (filterAreaExecuted !== "all") {
      list = list.filter(t => ["concluido","arquivado"].includes(t?.status) && getExecutedArea(t) === filterAreaExecuted);
    }
    if (filterTicketType !== "all") {
      list = list.filter(t => t?.tipo === filterTicketType);
    }
    if (filterAreaAtual !== "all") {
      list = list.filter(t => t?.area === filterAreaAtual);
    }
    if (filterAtribuido !== "all") {
      list = list.filter(t => (t?.atribuidoA === filterAtribuido));
    }

    if ((searchTerm || "").trim()) {
      list = list.filter(t => {
        const byId = looksLikeId ? ((t.id || "").toString().toLowerCase().includes(idCandidate)) : false;
        const byText = searchTermNorm ? [
          norm(t.titulo),
          norm(t.descricao),
          norm(t.prioridade),
          norm(t.status),
          norm(t.area),
          norm(t.areaDeOrigem || t.areaInicial),
          norm(t.tipo),
          norm(getUserName(t.atribuidoA)),
        ].some(x => x.includes(searchTermNorm)) : false;
        return byId || byText;
      });
    }

    return list;
  }, [tickets, filterAreaOrigin, filterAreaExecuted, filterTicketType, filterAreaAtual, filterAtribuido, searchTerm, searchTermNorm, idCandidate, looksLikeId]);

  // ---------- Enriquecimento p/ export ----------
  async function enrichTicketsWithDetails(list) {
    const byId = new Map(list.map(t => [t.id, t]));
    const needs = list.filter(t => !t?.camposEspecificos || (Array.isArray(t.camposEspecificos) && t.camposEspecificos.length === 0));
    if (needs.length === 0) return list;

    const ids = needs.map(t => t.id).filter(Boolean);
    const chunk = (arr, size) => arr.reduce((acc, _, i) => (i % size ? acc : acc.concat([arr.slice(i, i + size)])), []);
    for (const group of chunk(ids, 20)) {
      const docs = await Promise.all(group.map(id => ticketService.getTicketById(id).catch(() => null)));
      for (const doc of docs) {
        if (!doc) continue;
        const prev = byId.get(doc.id) || {};
        byId.set(doc.id, { ...prev, ...doc });
      }
    }
    return Array.from(byId.values());
  }

  // ---------- Flatten (1 linha por chamado) ----------
  function parseBRLToNumber(s) {
    if (s === null || s === undefined) return 0;
    const txt = String(s).replace(/\s/g, "");
    const norm = txt.replace(/R\$\s?/i, "").replace(/\./g, "").replace(",", ".");
    const n = Number(norm);
    return Number.isFinite(n) ? n : 0;
  }

  function flattenTicketRow(ticket) {
    const project = projects.find(p => p.id === ticket?.projetoId);
    const base = {
      id: ticket?.id || "",
      titulo: ticket?.titulo || "",
      descricao: (ticket?.descricao || "").trim(),
      status: ticket?.status || "",
      prioridade: ticket?.prioridade || "",
      area_origem: ticket?.areaDeOrigem || ticket?.areaInicial || "",
      area_atual: ticket?.area || "",
      area_executora: getExecutedArea(ticket) || "",
      tipo: ticket?.tipo || "",
      criado_por: getUserName(ticket?.criadoPor),
      atribuido_a: getUserName(ticket?.atribuidoA),
      executado_por: getExecutedByName(ticket) || "",
      criado_em: fmtDate(ticket?.createdAt),
      atualizado_em: fmtDate(ticket?.updatedAt),
      resolvido_em: fmtDate(ticket?.resolvidoEm),
      projeto_id: ticket?.projetoId || "",
      projeto_nome: project?.nome || "",
      evento: project?.feira || "",
      local: project?.local || "",
      metragem: project?.metragem || "",
      is_extra: !!ticket?.isExtra,
    };

    const itens = Array.isArray(ticket?.camposEspecificos) ? ticket.camposEspecificos : [];
    if (itens.length === 0) return base;

    const alias = {
      motorista: "motorista",
      placa: "placa",
      dataFrete: "data_frete",
      finalidadeFrete: "finalidade",
      valorInicial: "valor_inicial",
      valorNegociado: "valor_negociado",
      centroCustos: "centro_custos",
      dadosPagamento: "dados_pagamento",
      qtdHR: "qtd_hr",
      qtdBau: "qtd_bau",
      qtdCarreta: "qtd_carreta",
      qtdGuincho: "qtd_guincho",
    };

    const aggText = {};
    const aggNum = {};

    const pushText = (key, val) => {
      if (val === undefined || val === null || val === "") return;
      const s = String(val);
      if (!aggText[key]) aggText[key] = new Set();
      aggText[key].add(s);
    };

    const addNum = (key, val) => {
      const n = Number(val);
      if (!Number.isFinite(n)) return;
      aggNum[key] = (aggNum[key] || 0) + n;
    };

    itens.forEach(item => {
      Object.entries(item || {}).forEach(([k, v]) => {
        if (k === "id") return;
        const col = alias[k] || k;
        if (col === "valor_inicial" || col === "valor_negociado") {
          addNum(`${col}_total_num`, parseBRLToNumber(v));
          pushText(col, v);
          return;
        }
        if (/^qtd_/i.test(col)) {
          const num = Number(String(v).replace(",", ".").replace(/\s/g, ""));
          addNum(`${col}_total_num`, Number.isFinite(num) ? num : 0);
          pushText(col, v);
          return;
        }
        pushText(col, v);
      });
    });

    const textCols = Object.fromEntries(Object.entries(aggText).map(([k, set]) => [k, Array.from(set).join(" | ")]));
    return { ...base, ...textCols, ...aggNum, itens_count: itens.length };
  }

  function buildExportRows(list) {
    return list.map(t => flattenTicketRow(t));
  }

  // ---------- Export ----------
  function exportAsCSV(rows, filename = "relatorio.csv") {
    if (!rows || !rows.length) {
      alert("Nenhum dado para exportar.");
      return;
    }
    const headers = Array.from(new Set(rows.flatMap(r => Object.keys(r))));
    const escape = (val) => {
      const s = (val ?? "").toString();
      if (/[;\n"]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const csv = [
      headers.join(";"),
      ...rows.map(r => headers.map(h => escape(r[h])).join(";"))
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function exportAsXLSX(rows, filename = "relatorio.xlsx") {
    try {
      const XLSX = await import("xlsx");
      const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
      const normalized = rows.map((r) => {
        const obj = {};
        headers.forEach((h) => (obj[h] = r[h] ?? ""));
        return obj;
      });
      const ws = (XLSX.utils || XLSX).json_to_sheet(normalized);
      const wb = (XLSX.utils || XLSX).book_new();
      (XLSX.utils || XLSX).book_append_sheet(wb, ws, "Relatorio");
      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([wbout], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn("xlsx não encontrado; exportando CSV.", e);
      exportAsCSV(rows, filename.replace(/\.xlsx$/i, ".csv"));
    }
  }

  function filterTicketsForExport(list) {
    let arr = [...list];
    if (filterAreaOrigin !== "all") {
      arr = arr.filter(t => (t?.areaDeOrigem || t?.areaInicial) === filterAreaOrigin);
    }
    if (filterAreaExecuted !== "all") {
      arr = arr.filter(t => ["concluido","arquivado"].includes(t?.status) && getExecutedArea(t) === filterAreaExecuted);
    }
    if (filterTicketType !== "all") {
      arr = arr.filter(t => t?.tipo === filterTicketType);
    }
    if (filterAreaAtual !== "all") {
      arr = arr.filter(t => t?.area === filterAreaAtual);
    }
    if (filterAtribuido !== "all") {
      arr = arr.filter(t => t?.atribuidoA === filterAtribuido);
    }
    return arr;
  }

  async function handleExport() {
    const base = filterTicketsForExport(filteredTickets.length ? filteredTickets : tickets);
    const enriched = await enrichTicketsWithDetails(base);
    const rows = buildExportRows(enriched);

    const nameParts = [];
    if (filterAreaOrigin !== "all") nameParts.push(`origem-${filterAreaOrigin}`);
    if (filterAreaExecuted !== "all") nameParts.push(`exec-${filterAreaExecuted}`);
    if (filterTicketType !== "all") nameParts.push(`tipo-${filterTicketType}`);
    if (filterAreaAtual !== "all") nameParts.push(`area-${filterAreaAtual}`);
    if (filterAtribuido !== "all") nameParts.push(`atr-${getUserName(filterAtribuido).replace(/\s+/g,"_")}`);
    const fname = `relatorio_${nameParts.join("_") || "geral"}_${Date.now()}`;

    if (exportFormat === "xlsx") {
      await exportAsXLSX(rows, `${fname}.xlsx`);
    } else {
      exportAsCSV(rows, `${fname}.csv`);
    }
  }

  // ---------- KPIs + Gráficos (reagem aos filtros) ----------
  const vizData = useMemo(() => {
    const list = filterTicketsForExport(filteredTickets);
    const total = list.length;
    const concluidos = list.filter(t => ["concluido","arquivado"].includes(t?.status)).length;
    const abertos = total - concluidos;

    // por status
    const byStatusMap = new Map();
    list.forEach(t => {
      const k = t?.status || "sem_status";
      byStatusMap.set(k, (byStatusMap.get(k) || 0) + 1);
    });
    const byStatus = Array.from(byStatusMap, ([name, value]) => ({ name, value }));

    // por tipo (top 8)
    const byTipoMap = new Map();
    list.forEach(t => {
      const k = t?.tipo || "sem_tipo";
      byTipoMap.set(k, (byTipoMap.get(k) || 0) + 1);
    });
    const byTipoAll = Array.from(byTipoMap, ([tipo, qt]) => ({ tipo, qt }));
    byTipoAll.sort((a,b) => b.qt - a.qt);
    const byTipo = byTipoAll.slice(0, 8);

    // por área executora
    const byExecMap = new Map();
    list.forEach(t => {
      const k = getExecutedArea(t) || "(pendente)";
      byExecMap.set(k, (byExecMap.get(k) || 0) + 1);
    });
    const byExec = Array.from(byExecMap, ([area, qt]) => ({ area, qt }));

    return { total, concluidos, abertos, byStatus, byTipo, byExec };
  }, [filteredTickets, filterAreaOrigin, filterAreaExecuted, filterTicketType, filterAreaAtual, filterAtribuido]);

  const PIE_COLORS = ["#6366f1","#22c55e","#f59e0b","#ef4444","#06b6d4","#a855f7","#84cc16","#f97316","#14b8a6"];

  // ---------- UI ----------
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Relatórios e Exportação</CardTitle>
          <CardDescription>
            Exporte planilhas com todos os campos dos chamados (incluindo campos específicos de Financeiro/Compras/Locação).
            Uma linha por chamado. Os gráficos abaixo reagem aos filtros.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          {/* Busca */}
          <div className="xl:col-span-4">
            <Label>Busca</Label>
            <Input
              placeholder="Buscar por título, descrição, área, tipo, atribuído ou #ID"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9"
            />
          </div>

          {/* Origem */}
          <div className="space-y-2">
            <Label>Área que abriu (origem)</Label>
            <Select value={filterAreaOrigin} onValueChange={setFilterAreaOrigin}>
              <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {AREA_LIST.map((a) => <SelectItem key={`o-${a}`} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Executora */}
          <div className="space-y-2">
            <Label>Área que executou (concluiu)</Label>
            <Select value={filterAreaExecuted} onValueChange={setFilterAreaExecuted}>
              <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {AREA_LIST.map((a) => <SelectItem key={`e-${a}`} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Aplica-se a chamados concluídos/arquivados.</p>
          </div>

          {/* Tipo */}
          <div className="space-y-2">
            <Label>Tipo de chamado</Label>
            <Select value={filterTicketType} onValueChange={setFilterTicketType}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {TIPO_LIST.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Área atual */}
          <div className="space-y-2">
            <Label>Área atual</Label>
            <Select value={filterAreaAtual} onValueChange={setFilterAreaAtual}>
              <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {AREA_LIST.map(a => <SelectItem key={`aa-${a}`} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Atribuído a */}
          <div className="space-y-2">
            <Label>Atribuído a</Label>
            <Select value={filterAtribuido} onValueChange={setFilterAtribuido}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {ATRIBUIDO_LIST.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Formato + Exportar */}
          <div className="space-y-2">
            <Label>Formato</Label>
            <Select value={exportFormat} onValueChange={setExportFormat}>
              <SelectTrigger><SelectValue placeholder="Escolha o formato" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                <SelectItem value="csv">CSV (.csv)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            <Button className="w-full" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" /> Exportar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-base">Total de chamados</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold">{vizData.total}</CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-base">Concluídos</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold">{vizData.concluidos}</CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-base">Abertos</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold">{vizData.abertos}</CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="h-[360px]">
          <CardHeader className="py-3"><CardTitle className="text-base">Distribuição por Status</CardTitle></CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={vizData.byStatus} dataKey="value" nameKey="name" outerRadius={100} label>
                  {vizData.byStatus.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="h-[360px]">
          <CardHeader className="py-3"><CardTitle className="text-base">Top Tipos de Chamado</CardTitle></CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={vizData.byTipo} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="tipo" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="qt" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="h-[360px]">
          <CardHeader className="py-3"><CardTitle className="text-base">Chamados por Área Executora</CardTitle></CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={vizData.byExec} layout="vertical" margin={{ top: 10, right: 20, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="area" width={120} />
                <Tooltip />
                <Bar dataKey="qt" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {error && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="py-3 text-red-800">{error}</CardContent>
        </Card>
      )}

      {loading && (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">Carregando dados...</CardContent>
        </Card>
      )}
    </div>
  );
}
