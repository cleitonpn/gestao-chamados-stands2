// src/pages/AllDiariesPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import DiaryCard from "../components/DiaryCard";
import DiaryForm from "../components/DiaryForm";
import {
  createDiaryWithFeed,
  diaryService,
} from "../services/diaryService";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../services/firebase"; // ✅ caminho corrigido

export default function AllDiariesPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  // companyId é opcional; se não usar multiempresa, o feed cai na coleção raiz /diary_feed
  const { currentUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);

  const [limitN, setLimitN] = useState(Number(params.get("limit")) || 20);
  const [search, setSearch] = useState(params.get("q") || "");
  const [selectedProjectId, setSelectedProjectId] = useState(params.get("projectId") || "");
  const [filters, setFilters] = useState({
    area: params.get("area") || "",
    atribuidoA: params.get("atribuidoA") || "",
  });

  const [projects, setProjects] = useState([]);

  // Carrega projetos (coleção top-level "projetos", conforme suas regras)
  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, "projetos"));
      const list = [];
      snap.forEach(d => {
        const data = d.data() || {};
        const name = data.nome || data.name || data.projectName || d.id;
        list.push({ id: d.id, name });
      });
      list.sort((a, b) => a.name.localeCompare(b.name));
      setProjects(list);
    })();
  }, []);

  // Sincroniza estado -> URL
  useEffect(() => {
    const next = new URLSearchParams();
    if (limitN) next.set("limit", String(limitN));
    if (search) next.set("q", search);
    if (selectedProjectId) next.set("projectId", selectedProjectId);
    if (filters.area) next.set("area", filters.area);
    if (filters.atribuidoA) next.set("atribuidoA", filters.atribuidoA);
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limitN, search, selectedProjectId, filters.area, filters.atribuidoA]);

  // Carrega feed conforme estado
  useEffect(() => {
    let stop = false;

    async function run() {
      setLoading(true);
      try {
        let res;
        if (selectedProjectId) {
          res = await diaryService.fetchFeedByProject({
            projectId: selectedProjectId,
            pageSize: limitN,
          });
        } else if (search.trim()) {
          res = await diaryService.searchFeedByProjectName({
            term: search.trim(),
            pageSize: limitN,
          });
        } else {
          res = await diaryService.fetchFeedRecent({
            pageSize: limitN,
            filters,
          });
        }
        if (!stop) {
          setItems(res.items || []);
          setCursor(res.nextCursor || null);
        }
      } finally {
        if (!stop) setLoading(false);
      }
    }
    run();

    return () => { stop = true; };
  }, [limitN, search, selectedProjectId, filters.area, filters.atribuidoA]);

  const handleLoadMore = async () => {
    if (!cursor || selectedProjectId || search.trim()) return;
    const res = await diaryService.fetchFeedRecent({
      pageSize: limitN,
      cursor,
      filters,
    });
    setItems(prev => [...prev, ...(res.items || [])]);
    setCursor(res.nextCursor || null);
  };

  const gotoProject = (projectId) => {
    navigate(`/projeto/${projectId}`); // ✅ sua rota é singular
  };

  const handleCreate = async ({ projectId, projectName, text, area, atribuidoA, linkUrl }) => {
    await createDiaryWithFeed(
      projectId,
      {
        authorId: currentUser?.uid,
        authorName: currentUser?.displayName || currentUser?.email || "Usuário",
        authorRole: "colaborador",
        text,
        area: area || null,
        atribuidoA: atribuidoA || null,
        linkUrl: linkUrl || null,
        attachments: [],
      },
      {
        // companyId: null, // se não usar multiempresa, deixe null (feed em /diary_feed)
        projectName,
      }
    );

    // recarrega lista atual
    if (selectedProjectId) {
      const res = await diaryService.fetchFeedByProject({
        projectId: selectedProjectId,
        pageSize: limitN,
      });
      setItems(res.items || []);
    } else if (search.trim()) {
      const res = await diaryService.searchFeedByProjectName({
        term: search.trim(),
        pageSize: limitN,
      });
      setItems(res.items || []);
    } else {
      const res = await diaryService.fetchFeedRecent({
        pageSize: limitN,
        filters,
      });
      setItems(res.items || []);
      setCursor(res.nextCursor || null);
    }
  };

  const header = useMemo(() => (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="flex-1">
        <h1 className="text-xl font-semibold">Todos os Diários</h1>
        <p className="text-sm text-neutral-400">Últimas inserções, busca por projeto e publicação rápida.</p>
      </div>
      <div className="flex gap-2">
        <select
          className="rounded-lg bg-neutral-900 border border-neutral-700 p-2"
          value={limitN}
          onChange={(e) => setLimitN(Number(e.target.value))}
        >
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={50}>50</option>
        </select>
      </div>
    </div>
  ), [limitN]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      {header}

      {/* Filtros */}
      <div className="grid md:grid-cols-4 gap-3">
        <input
          className="rounded-lg bg-neutral-900 border border-neutral-700 p-2"
          placeholder="Buscar por nome do projeto…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setSelectedProjectId(""); }}
        />
        <select
          className="rounded-lg bg-neutral-900 border border-neutral-700 p-2"
          value={selectedProjectId}
          onChange={(e) => { setSelectedProjectId(e.target.value); setSearch(""); }}
        >
          <option value="">Filtrar por projeto…</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input
          className="rounded-lg bg-neutral-900 border border-neutral-700 p-2"
          placeholder="Filtrar por área…"
          value={filters.area}
          onChange={(e) => setFilters(prev => ({ ...prev, area: e.target.value }))}
        />
        <input
          className="rounded-lg bg-neutral-900 border border-neutral-700 p-2"
          placeholder="Filtrar por atribuído a…"
          value={filters.atribuidoA}
          onChange={(e) => setFilters(prev => ({ ...prev, atribuidoA: e.target.value }))}
        />
      </div>

      {/* Form para publicar direto da página */}
      <DiaryForm
        projects={projects}
        onSubmit={handleCreate}
        defaultProjectId={selectedProjectId || ""}
      />

      {/* Lista */}
      <div className="mt-2">
        {loading && <div className="text-sm text-neutral-400">Carregando…</div>}
        {!loading && items.length === 0 && (
          <div className="text-sm text-neutral-400">Nenhum diário encontrado.</div>
        )}
        {items.map(i => (
          <DiaryCard key={i.id} item={i} onProjectClick={gotoProject} />
        ))}
        {!loading && cursor && !selectedProjectId && !search && (
          <button
            onClick={handleLoadMore}
            className="mt-2 px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 hover:bg-neutral-700"
          >
            Carregar mais
          </button>
        )}
      </div>
    </div>
  );
}
