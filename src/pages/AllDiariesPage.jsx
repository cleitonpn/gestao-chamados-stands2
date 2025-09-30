import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../config/firebase";
import { useAuth } from "../contexts/AuthContext";
import { diaryService } from "../services/diaryService";
import DiaryCard from "../components/DiaryCard";
import DiaryForm from "../components/DiaryForm";
import { ArrowLeft, Search } from "lucide-react";

// heurística para considerar projeto ativo
function isActiveProject(data = {}) {
  const status = (data.status || data.fase || data.situacao || "").toString().toLowerCase();
  const negativeWords = ["encerr", "finaliz", "conclu", "inativ", "fech", "arquiv", "cancel"];
  const negativeFlag =
    data.arquivado === true ||
    data.ativo === false ||
    data.encerrado === true ||
    data.finalizado === true ||
    negativeWords.some((w) => status.includes(w));
  return !negativeFlag;
}

export default function AllDiariesPage() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [highlights, setHighlights] = useState([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [limitN, setLimitN] = useState(20);

  const [projects, setProjects] = useState([]);
  const [projSearch, setProjSearch] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");

  // carrega projetos (somente ativos)
  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, "projetos"));
      const list = [];
      snap.forEach((d) => {
        const data = d.data() || {};
        if (isActiveProject(data)) {
          const name = data.nome || data.name || data.projectName || d.id;
          list.push({ id: d.id, name });
        }
      });
      list.sort((a, b) => a.name.localeCompare(b.name));
      setProjects(list);
    })();
  }, []);

  // highlights (3 mais recentes)
  useEffect(() => {
    (async () => {
      const res = await diaryService.fetchFeedRecent({ pageSize: 3 });
      setHighlights(res.items || []);
    })();
  }, []);

  // feed
  const loadFeed = async () => {
    setLoadingFeed(true);
    try {
      let res;
      if (selectedProjectId) {
        res = await diaryService.fetchFeedByProject({
          projectId: selectedProjectId,
          pageSize: limitN,
        });
      } else {
        res = await diaryService.fetchFeedRecent({ pageSize: limitN });
      }
      setItems(res.items || []);
      setCursor(res.nextCursor || null);
    } finally {
      setLoadingFeed(false);
    }
  };
  useEffect(() => {
    loadFeed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId, limitN]);

  const handleLoadMore = async () => {
    if (!cursor || selectedProjectId) return;
    const res = await diaryService.fetchFeedRecent({ pageSize: limitN, cursor });
    setItems((prev) => [...prev, ...(res.items || [])]);
    setCursor(res.nextCursor || null);
  };

  const gotoProject = (projectId) => navigate(`/projeto/${projectId}`);

  const handleCreate = async ({ projectId, projectName, text, area, atribuidoA, linkUrl }) => {
    // evita undefined em authorId e também garante compat com regras do feed
    if (!currentUser?.uid) {
      alert("Usuário ainda não carregado. Tente novamente em 2 segundos.");
      return;
    }
    await diaryService.addEntryWithFeed(
      projectId,
      {
        authorId: currentUser.uid,                                // << garante não-undefined
        authorName: currentUser.displayName || currentUser.email || "Usuário",
        authorRole: "colaborador",
        text,
        area: area || null,
        atribuidoA: atribuidoA || null,
        linkUrl: linkUrl || null,
        attachments: [],
      },
      { projectName }
    );
    const hi = await diaryService.fetchFeedRecent({ pageSize: 3 });
    setHighlights(hi.items || []);
    await loadFeed();
  };

  const filteredProjects = useMemo(() => {
    const q = projSearch.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projSearch, projects]);

  return (
    <div className="px-4 md:px-6 py-4 space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/dashboard")}
          className="inline-flex items-center gap-2 text-slate-700 hover:text-slate-900 bg-white border border-slate-200 rounded-lg px-3 py-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao Dashboard
        </button>
        <h1 className="text-2xl font-semibold text-slate-900">Diário do Projeto</h1>
      </div>

      {/* highlights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {highlights.map((h) => {
          const createdAt = h.createdAt?.toDate
            ? h.createdAt.toDate()
            : h.createdAt?._seconds
            ? new Date(h.createdAt._seconds * 1000)
            : null;
          const preview = (h.text || "").length > 160 ? (h.text || "").slice(0, 160) + "…" : (h.text || "");
          return (
            <div key={h.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <div className="text-xs text-slate-500">{createdAt ? createdAt.toLocaleString() : "—"}</div>
              <button className="mt-1 text-blue-600 hover:underline font-medium" onClick={() => gotoProject(h.projectId)}>
                {h.projectName || "Projeto"}
              </button>
              <div className="text-xs text-slate-500 mt-0.5">{h.authorName || "—"}</div>
              <p className="mt-2 text-sm text-slate-700">{preview}</p>
            </div>
          );
        })}
        {highlights.length === 0 && (
          <div className="md:col-span-3 text-sm text-slate-500">Nenhum diário recente.</div>
        )}
      </div>

      {/* 3 colunas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
            <h2 className="text-base font-semibold text-slate-900 mb-3">Novo diário</h2>
            <DiaryForm projects={projects} onSubmit={handleCreate} defaultProjectId={selectedProjectId || ""} />
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-slate-900">
                  {selectedProjectId ? "Diários do projeto" : "Últimos diários"}
                </h2>
                {selectedProjectId && (
                  <button onClick={() => setSelectedProjectId("")} className="text-xs text-slate-600 hover:underline">
                    limpar seleção
                  </button>
                )}
              </div>
              <select
                className="rounded-lg bg-white border border-slate-200 text-slate-700 p-2"
                value={limitN}
                onChange={(e) => setLimitN(Number(e.target.value))}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>

            <div className="h-[70vh] overflow-y-auto pr-1">
              {loadingFeed && <div className="text-sm text-slate-500">Carregando…</div>}
              {!loadingFeed && items.length === 0 && <div className="text-sm text-slate-500">Nenhum diário encontrado.</div>}
              {items.map((i) => (
                <DiaryCard key={i.id} item={i} onProjectClick={gotoProject} />
              ))}
              {!loadingFeed && cursor && !selectedProjectId && (
                <div className="pt-2">
                  <button
                    onClick={handleLoadMore}
                    className="w-full rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-2"
                  >
                    Carregar mais
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
            <h2 className="text-base font-semibold text-slate-900">Projetos ativos</h2>
            <div className="mt-3 relative">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
              <input
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-700"
                placeholder="Buscar projeto…"
                value={projSearch}
                onChange={(e) => setProjSearch(e.target.value)}
              />
            </div>
            <div className="mt-3 h-[60vh] overflow-y-auto pr-1">
              {filteredProjects.length === 0 && <div className="text-sm text-slate-500">Nenhum projeto encontrado.</div>}
              <ul className="space-y-1">
                {filteredProjects.map((p) => {
                  const active = selectedProjectId === p.id;
                  return (
                    <li key={p.id}>
                      <button
                        onClick={() => setSelectedProjectId(active ? "" : p.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg border ${
                          active
                            ? "bg-blue-50 border-blue-200 text-blue-800"
                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {p.name}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
