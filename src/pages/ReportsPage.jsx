
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { projectService } from "../services/projectService";
import { ticketService } from "../services/ticketService";
import { userService } from "../services/userService";

// UI (shadcn)
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Icons
import { Download, Filter } from "lucide-react";

function ReportsPage() {
  const { user, userProfile, authInitialized } = useAuth();
  const navigate = useNavigate();

  // Basic data
  const [projects, setProjects] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [allUsers, setAllUsers] = useState([]);

  // Loading
  const [loading, setLoading] = useState(true);

  // Export filters
  const [exportFormat, setExportFormat] = useState("xlsx"); // 'xlsx' | 'csv'
  const [exportAreaOrigin, setExportAreaOrigin] = useState("all");
  const [exportAreaExecuted, setExportAreaExecuted] = useState("all");
  const [exportTicketType, setExportTicketType] = useState("all");
  const [searchText, setSearchText] = useState("");

  // --- Auth gate ---
  useEffect(() => {
    if (!authInitialized) return;
    if (!user) {
      navigate("/login");
    }
  }, [authInitialized, user, navigate]);

  // --- Load data ---
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [proj, tks, users] = await Promise.all([
          projectService.getAllProjects(),
          ticketService.getAllTickets(),
          userService.getAllUsers()
        ]);

        setProjects(Array.isArray(proj) ? proj : []);
        setTickets(Array.isArray(tks) ? tks : []);
        setAllUsers(Array.isArray(users) ? users : []);
      } catch (e) {
        console.error("Erro ao carregar dados dos relatórios:", e);
        setProjects([]);
        setTickets([]);
        setAllUsers([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // --- Helpers ---
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
    return allUsers.find((u) => u.id === id || u.uid === id) || null;
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

  // Filter base list according to selects and quick search
  const filteredTickets = useMemo(() => {
    let arr = [...tickets];

    // Quick search on title/desc/id
    const term = (searchText || "").trim().toLowerCase();
    if (term) {
      const norm = (s) =>
        (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const hasHash = term.startsWith("#");
      const idCandidate = hasHash ? term.slice(1) : term;

      arr = arr.filter((t) => {
        const byId = ((t.id || "").toString().toLowerCase().includes(idCandidate));
        const byText =
          norm(t.titulo).includes(norm(term)) ||
          norm(t.descricao).includes(norm(term));
        return byId || byText;
      });
    }

    // Area origin
    if (exportAreaOrigin !== "all") {
      arr = arr.filter((t) => (t?.areaDeOrigem || t?.areaInicial) === exportAreaOrigin);
    }

    // Area executed (for closed/archived)
    if (exportAreaExecuted !== "all") {
      arr = arr.filter(
        (t) => ["concluido", "arquivado"].includes(t?.status) && getExecutedArea(t) === exportAreaExecuted
      );
    }

    // Type
    if (exportTicketType !== "all") {
      arr = arr.filter((t) => t?.tipo === exportTicketType);
    }

    return arr;
  }, [tickets, exportAreaOrigin, exportAreaExecuted, exportTicketType, searchText]);

  const AREA_LIST = useMemo(() => {
    const fromUsers = Array.from(new Set((allUsers || []).map((u) => u?.area).filter(Boolean)));
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
    return Array.from(new Set((tickets || []).map((t) => t?.tipo).filter(Boolean))).sort();
  }, [tickets]);

  // Flatten tickets to rows for export
  const flattenTicketRows = (ticket) => {
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
      criado_por: findUser(ticket?.criadoPor)?.nome || "",
      atribuido_a: findUser(ticket?.atribuidoA)?.nome || "",
      executado_por: getExecutedByName(ticket) || "",
      criado_em: fmtDate(ticket?.createdAt),
      atualizado_em: fmtDate(ticket?.updatedAt),
      resolvido_em: fmtDate(ticket?.resolvidoEm),
      is_extra: !!ticket?.isExtra,
      projeto_id: ticket?.projetoId || "",
      projeto_nome: project?.nome || "",
      evento: project?.feira || "",
      local: project?.local || "",
      metragem: project?.metragem || "",
      tipo: ticket?.tipo || "",
    };

    const itens = Array.isArray(ticket?.camposEspecificos) ? ticket.camposEspecificos : [];
    if (itens.length === 0) return [base];

    return itens.map((item, idx) => {
      const itemCols = {};
      Object.entries(item || {}).forEach(([k, v]) => {
        if (k === "id") return;
        itemCols[`item_${idx + 1}_${k}`] = (v ?? "").toString();
      });
      return { ...base, ...itemCols, itens_count: itens.length };
    });
  };

  const buildExportRows = (ticketsList) => {
    const rows = [];
    ticketsList.forEach((t) => flattenTicketRows(t).forEach((r) => rows.push(r)));
    return rows;
  };

  const exportAsCSV = (rows, filename = "relatorio.csv") => {
    if (!rows.length) {
      alert("Nenhum dado para exportar.");
      return;
    }
    const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
    const escape = (val) => {
      const s = (val ?? "").toString();
      if (/[;\n"]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const csv = [headers.join(";"), ...rows.map((r) => headers.map((h) => escape(r[h])).join(";"))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  async function exportAsXLSX(rows, filename = "relatorio.xlsx") {
    try {
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Relatorio");
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

  async function handleExport() {
    const base = filteredTickets;
    const rows = buildExportRows(base);
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Relatórios</h1>
          <p className="text-sm text-gray-500">
            Exporte planilhas completas com todos os campos (inclusive Financeiro/Compras/Locação).
          </p>
        </div>
      </header>

      {/* Export Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Download className="h-5 w-5 mr-2" /> Exportação Excel/CSV (campos completos)
          </CardTitle>
          <CardDescription>
            Escolha área de origem, área executora e tipo de chamado. Pesquisa rápida por texto/ID.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label>Área que abriu (origem)</Label>
            <Select value={exportAreaOrigin} onValueChange={setExportAreaOrigin}>
              <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {AREA_LIST.map((a) => (
                  <SelectItem key={`o-${a}`} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>Área que executou (concluiu)</Label>
            <Select value={exportAreaExecuted} onValueChange={setExportAreaExecuted}>
              <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {AREA_LIST.map((a) => (
                  <SelectItem key={`e-${a}`} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">Aplica-se a chamados concluídos/arquivados.</p>
          </div>

          <div className="space-y-2">
            <Label>Tipo de chamado</Label>
            <Select value={exportTicketType} onValueChange={setExportTicketType}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {TIPO_LIST.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Formato</Label>
            <Select value={exportFormat} onValueChange={setExportFormat}>
              <SelectTrigger><SelectValue placeholder="Formato" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                <SelectItem value="csv">CSV (.csv)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>Busca rápida (título/descrição/#id)</Label>
            <Input
              placeholder="Ex.: pagamento frete, #YTOks8hY"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>

          <div className="flex items-end">
            <Button className="w-full" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" /> Exportar
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading && (
        <div className="text-sm text-gray-500">Carregando dados…</div>
      )}
    </div>
  );
}

export default ReportsPage;
