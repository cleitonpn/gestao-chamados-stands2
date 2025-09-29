
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

// Serviços (mantém os caminhos que você já usa no projeto)
import { projectService } from "../services/projectService";
import { ticketService } from "../services/ticketService";
import { userService } from "../services/userService";

/**
 * Página de Relatórios (com Exportação Excel/CSV)
 * - Filtros: Área de origem, Área executora, Tipo de chamado, Busca (#id, título/descrição)
 * - Exporta todos os campos + específicos agregados (1 linha por chamado)
 * - Se faltar camposEspecificos no snapshot, enriquece com getTicketById antes de exportar
 */

export default function ReportsPage() {
  // ---------- Dados base ----------
  const [projects, setProjects] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ---------- Filtros da página / exportação ----------
  const [searchTerm, setSearchTerm] = useState("");
  const [exportFormat, setExportFormat] = useState("xlsx"); // 'xlsx' | 'csv'
  const [exportAreaOrigin, setExportAreaOrigin] = useState("all");
  const [exportAreaExecuted, setExportAreaExecuted] = useState("all");
  const [exportTicketType, setExportTicketType] = useState("all");

  // ---------- Carregamento inicial ----------
  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        setLoading(true);
        const [p, t, u] = await Promise.all([
          projectService.getAllProjects?.() ?? [],
          ticketService.getAllTickets?.() ?? [],
          userService.getAllUsers?.() ?? [],
        ]);
        if (!isMounted) return;
        setProjects(Array.isArray(p) ? p : []);
        setTickets(Array.isArray(t) ? t : []);
        setAllUsers(Array.isArray(u) ? u : []);
      } catch (e) {
        console.error(e);
        if (isMounted) setError("Falha ao carregar dados de relatórios.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, []);

  // ---------- Helpers ----------
  const fmtDate = (d) => {
    try {
      const dt = d?.toDate ? d.toDate() : d;
      if (!dt) return "";
      return new Date(dt).toLocaleString("pt-BR");
    } catch {
      return "";
    }
  };

  const findUser = (id) => {
    if (!id) return null;
    return allUsers.find((u) => u.id === id || u.uid === id);
  };

  const getExecutedArea = (ticket) => {
    const isClosed = ["concluido", "arquivado"].includes(ticket?.status);
    const resolvedById =
      ticket?.resolvidoPor ||
      ticket?.concluídoPor ||
      ticket?.finalizadoPor ||
      (isClosed ? ticket?.atribuidoA : null);
    const user = findUser(resolvedById);
    return user?.area || null;
  };

  const getExecutedByName = (ticket) => {
    const isClosed = ["concluido", "arquivado"].includes(ticket?.status);
    const resolvedById =
      ticket?.resolvidoPor ||
      ticket?.concluídoPor ||
      ticket?.finalizadoPor ||
      (isClosed ? ticket?.atribuidoA : null);
    const user = findUser(resolvedById);
    return user?.nome || "";
  };

  // listas para selects
  const AREA_LIST = useMemo(() => {
    const fromUsers = Array.from(
      new Set((allUsers || []).map((u) => u?.area).filter(Boolean))
    );
    const fromTickets = Array.from(
      new Set(
        (tickets || [])
          .flatMap((t) => [t?.areaDeOrigem, t?.areaInicial, t?.area])
          .filter(Boolean)
      )
    );
    return Array.from(new Set([...fromUsers, ...fromTickets])).sort();
  }, [allUsers, tickets]);

  const TIPO_LIST = useMemo(() => {
    return Array.from(
      new Set((tickets || []).map((t) => t?.tipo).filter(Boolean))
    ).sort();
  }, [tickets]);

  // ---------- Busca local ----------
  const norm = (s) =>
    (s || "")
      .toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const searchTermNorm = norm(searchTerm);
  const idCandidate = (searchTerm || "").trim().replace(/^#/, "").toLowerCase();
  const looksLikeId =
    (searchTerm || "").startsWith("#") ||
    (/^[A-Za-z0-9_-]{6,}$/.test(idCandidate));

  const filteredTickets = useMemo(() => {
    let list = [...tickets];

    // filtros de select
    if (exportAreaOrigin !== "all") {
      list = list.filter(
        (t) => (t?.areaDeOrigem || t?.areaInicial) === exportAreaOrigin
      );
    }
    if (exportAreaExecuted !== "all") {
      list = list.filter(
        (t) =>
          ["concluido", "arquivado"].includes(t?.status) &&
          getExecutedArea(t) === exportAreaExecuted
      );
    }
    if (exportTicketType !== "all") {
      list = list.filter((t) => t?.tipo === exportTicketType);
    }

    // busca textual / por id
    if ((searchTerm || "").trim()) {
      list = list.filter((t) => {
        const byId = looksLikeId
          ? ((t.id || "").toString().toLowerCase().includes(idCandidate))
          : false;

        const byText = searchTermNorm
          ? [
              norm(t.titulo),
              norm(t.descricao),
              norm(t.prioridade),
              norm(t.status),
              norm(t.area),
              norm(t.areaDeOrigem || t.areaInicial),
              norm(t.tipo),
            ].some((x) => x.includes(searchTermNorm))
          : false;

        return byId || byText;
      });
    }

    return list;
  }, [
    tickets,
    exportAreaOrigin,
    exportAreaExecuted,
    exportTicketType,
    searchTerm,
    searchTermNorm,
    idCandidate,
    looksLikeId,
  ]);

  // ---------- Enriquecimento (traz camposEspecificos) ----------
  async function enrichTicketsWithDetails(list) {
    const byId = new Map(list.map((t) => [t.id, t]));
    const needs = list.filter(
      (t) =>
        !t?.camposEspecificos ||
        (Array.isArray(t.camposEspecificos) && t.camposEspecificos.length === 0)
    );
    if (needs.length === 0) return list;

    // chunk em lotes p/ não saturar
    const ids = needs.map((t) => t.id).filter(Boolean);
    const chunk = (arr, size) =>
      arr.reduce(
        (acc, _, i) => (i % size ? acc : acc.concat([arr.slice(i, i + size)])),
        []
      );

    for (const group of chunk(ids, 20)) {
      const docs = await Promise.all(
        group.map((id) => ticketService.getTicketById(id).catch(() => null))
      );
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
    // remove R$, pontos de milhar e troca vírgula por ponto
    const norm = txt.replace(/R\$\s?/i, "").replace(/\./g, "").replace(",", ".");
    const n = Number(norm);
    return Number.isFinite(n) ? n : 0;
  }

  function flattenTicketRow(ticket) {
    const project = projects.find((p) => p.id === ticket?.projetoId);
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
      criado_por: findUser(ticket?.criadoPor)?.nome || "",
      atribuido_a: findUser(ticket?.atribuidoA)?.nome || "",
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

    const itens = Array.isArray(ticket?.camposEspecificos)
      ? ticket.camposEspecificos
      : [];

    if (itens.length === 0) return base;

    // alias amigáveis para colunas mais comuns (Financeiro/Compras/Locação)
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

    // agregadores
    const aggText = {}; // junta strings " | "
    const aggNum = {}; // soma numéricos (valores e qtd_*)

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

    itens.forEach((item) => {
      Object.entries(item || {}).forEach(([k, v]) => {
        if (k === "id") return;
        const col = alias[k] || k;

        // heurísticas de agregação
        if (col === "valor_inicial" || col === "valor_negociado") {
          const num = parseBRLToNumber(v);
          addNum(`${col}_total_num`, num);
          pushText(col, v);
          return;
        }
        if (/^qtd_/i.test(col)) {
          const num = Number(String(v).replace(",", ".").replace(/\s/g, ""));
          addNum(`${col}_total_num`, Number.isFinite(num) ? num : 0);
          pushText(col, v);
          return;
        }

        // demais campos: juntar valores únicos
        pushText(col, v);
      });
    });

    // materializa sets em strings
    const textCols = Object.fromEntries(
      Object.entries(aggText).map(([k, set]) => [k, Array.from(set).join(" | ")])
    );

    return {
      ...base,
      ...textCols,
      ...aggNum,
      itens_count: itens.length,
    };
  }

  function buildExportRows(list) {
    return list.map((t) => flattenTicketRow(t));
  }

  // ---------- Exportadores ----------
  function exportAsCSV(rows, filename = "relatorio.csv") {
    if (!rows || !rows.length) {
      alert("Nenhum dado para exportar.");
      return;
    }
    const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
    const escape = (val) => {
      const s = (val ?? "").toString();
      if (/[;\n"]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const csv = [
      headers.join(";"),
      ...rows.map((r) => headers.map((h) => escape(r[h])).join(";")),
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
        type:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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

  // filtros aplicados
  function filterTicketsForExport(list) {
    let arr = [...list];
    if (exportAreaOrigin !== "all") {
      arr = arr.filter(
        (t) => (t?.areaDeOrigem || t?.areaInicial) === exportAreaOrigin
      );
    }
    if (exportAreaExecuted !== "all") {
      arr = arr.filter(
        (t) =>
          ["concluido", "arquivado"].includes(t?.status) &&
          getExecutedArea(t) === exportAreaExecuted
      );
    }
    if (exportTicketType !== "all") {
      arr = arr.filter((t) => t?.tipo === exportTicketType);
    }
    return arr;
  }

  // handler principal
  async function handleExport() {
    const base =
      filteredTickets.length > 0 ? filteredTickets : tickets;
    const enriched = await enrichTicketsWithDetails(base);
    const rows = buildExportRows(enriched);

    const nameParts = [];
    if (exportAreaOrigin !== "all") nameParts.push(`origem-${exportAreaOrigin}`);
    if (exportAreaExecuted !== "all") nameParts.push(`exec-${exportAreaExecuted}`);
    if (exportTicketType !== "all") nameParts.push(`tipo-${exportTicketType}`);
    const fname = `relatorio_${nameParts.join("_") || "geral"}_${Date.now()}`;

    if (exportFormat === "xlsx") {
      await exportAsXLSX(rows, `${fname}.xlsx`);
    } else {
      exportAsCSV(rows, `${fname}.csv`);
    }
  }

  // ---------- UI ----------
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Relatórios e Exportação</CardTitle>
          <CardDescription>
            Exporte planilhas com todos os campos dos chamados (incluindo campos específicos de Financeiro/Compras/Locação).
            Uma linha por chamado. Use os filtros abaixo para segmentar.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 lg:grid-cols-6 gap-4">
          <div className="lg:col-span-3">
            <Label>Busca</Label>
            <Input
              placeholder="Buscar por título, descrição, área, tipo ou #ID do chamado"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9"
            />
          </div>

          <div className="space-y-2">
            <Label>Área que abriu (origem)</Label>
            <Select value={exportAreaOrigin} onValueChange={setExportAreaOrigin}>
              <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {AREA_LIST.map((a) => (
                  <SelectItem key={`o-${a}`} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Área que executou (concluiu)</Label>
            <Select value={exportAreaExecuted} onValueChange={setExportAreaExecuted}>
              <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {AREA_LIST.map((a) => (
                  <SelectItem key={`e-${a}`} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Aplica-se a chamados concluidos/arquivados.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Tipo de chamado</Label>
            <Select value={exportTicketType} onValueChange={setExportTicketType}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {TIPO_LIST.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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

      {error && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="py-3 text-red-800">{error}</CardContent>
        </Card>
      )}

      {loading && (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">
            Carregando dados...
          </CardContent>
        </Card>
      )}
    </div>
  );
}
