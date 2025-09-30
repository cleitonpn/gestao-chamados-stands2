// src/pages/AllDiariesPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { db } from "../config/firebase";
import { useAuth } from "../contexts/AuthContext";
import { diaryService } from "../services/diaryService";
import DiaryCard from "../components/DiaryCard";
import DiaryForm from "../components/DiaryForm";
import { ArrowLeft, Search } from "lucide-react";

/* ----------------------------- helpers ----------------------------- */

// projeto é considerado ATIVO se não tiver sinalizações de encerrado/inativo/arquivado
function isActiveProject(data = {}) {
  const status = (data.status || data.fase || data.situacao || "")
    .toString()
    .toLowerCase();
  const negativeWords = [
    "encerr",
    "finaliz",
    "conclu",
    "inativ",
    "fech",
    "arquiv",
    "cancel",
  ];
  const negativeFlag =
    data.arquivado === true ||
    data.ativo === false ||
    data.encerrado === true ||
    data.finalizado === true ||
    negativeWords.some((w) => status.includes(w));
  return !negativeFlag;
}

// checa se um UID está numa lista/obj ou campo simples
function includesUid(maybeList, uid) {
  if (!uid || !maybeList) return false;
  if (Array.isArray(maybeList)) return maybeList.includes(uid);
  if (typeof maybeList === "object") return uid in maybeList;
  return maybeList === uid; // string simples
}

// espera o Firebase Auth estar pronto
async function ensureUser() {
  const auth = getAuth();
  if (auth.currentUser) return auth.currentUser;
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(
      auth,
      (u) => {
        unsub();
        resolve(u || null);
      },
      () => {
        unsub();
        resolve(null);
      }
    );
  });
}

/* ------------------------------ page ------------------------------ */

export default function AllDiariesPage() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  // dados do usuário (papel)
  const [userRole, setUserRole] = useState(""); // administrador | gerente | operador | consultor | produtor | ...
  const [authReady, setAuthReady] = useState(false);

  // highlights (top 3)
  const [highlights, setHighlights] = useState([]);

  // feed
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [limitN, setLimitN] = useState(20);

  // projetos (sidebar)
  const [projects, setProjects] = useState([]);
  const [projSearch, setProjSearch] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");

  // seleção em massa (somente admin)
  const [selectedIds, setSelectedIds] = useState(new Set());
  const isAdmin = userRole === "administrador";

  /* --------- carregar usuário (auth + papel em /usuarios/{uid}) --------- */
  useEffect(() => {
    (async () => {
      const u = currentUser || (await ensureUser());
      setAuthReady(!!u);
      if (u?.uid) {
        try {
          const uSnap = await getDoc(doc(db, "usuarios", u.uid));
          const funcao = (uSnap.data()?.funcao || "").toString().toLowerCase();
          setUserRole(funcao);
        } catch {
          setUserRole("");
        }
      }
    })();
  }, [currentUser]);

  /* --------------------- carregar projetos (com permissão) --------------------- */
  useEffect(() => {
    (async () => {
      const u = currentUser || (await ensureUser());
      const uid = u?.uid || null;
      const role = userRole;

      const snap = await getDocs(collection(db, "projetos"));
      const list = [];

      snap.forEach((d) => {
        const data = d.data() || {};
        if (!isActiveProject(data)) return;

        // privilégio total
        const privileged = ["administrador", "gerente", "operador"].includes(
          role
        );

        // atribuição ao projeto para consultor/produtor
        const isMine =
          includesUid(data.consultorId, uid) ||
          includesUid(data.consultorUid, uid) ||
          includesUid(data.produtorId, uid) ||
          includesUid(data.produtorUid, uid) ||
          includesUid(data.equipeUids, uid) ||
          includesUid(data.membrosUids, uid) ||
          includesUid(data.operadoresIds, uid) ||
          includesUid(data.assignedUids, uid) ||
          includesUid(data.owners, uid);

        if (privileged || isMine) {
          const name = data.nome || data.name || data.projectName || d.id;
          list.push({ id: d.id, name });
        }
      });

      list.sort((a, b) => a.name.localeCompare(b.name));
      setProjects(list);
    })();
  }, [currentUser, userRole]);

  /* ----------------------- highlights (3 mais recentes) ----------------------- */
  useEffect(() => {
    (async () => {
      const res = await diaryService.fetchFeedRecent({ pageSize: 3 });
      setHighlights(res.items || []);
    })();
  }, []);

  /* ---------------- feed principal (últimos ou por projeto) ---------------- */
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
      setSelectedIds(new Set()); // limpa seleção
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

  /* ------------------------- publicar novo diário ------------------------- */
  // agora com "attachments" (imagens) recebido do DiaryForm
  const handleCreate = async ({
    projectId,
    projectName,
    text,
    area,
    atribuidoA,
    linkUrl,
    attachments,
  }) => {
    // aguarda auth real do Firebase (mesmo que o contexto ainda não tenha)
    const user = currentUser || (await ensureUser());
    if (!user?.uid) {
      alert("Não foi possível identificar o usuário. Atualize a página e tente novamente.");
      return;
    }

    await diaryService.addEntryWithFeed(
      projectId,
      {
        authorId: user.uid, // evita undefined
        authorName: user.displayName || user.email || "Usuário",
        authorRole: userRole || "colaborador",
        text,
        area: area || null,
        atribuidoA: atribuidoA || null,
        linkUrl: linkUrl || null,
        attachments: Array.isArray(attachments) ? attachments : [],
      },
      { projectName }
    );

    // atualiza destaques e feed
    const hi = await diaryService.fetchFeedRecent({ pageSize: 3 });
    setHighlights(hi.items || []);
    await loadFeed();
  };

  // seleção / exclusão (somente admin)
  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const allVisibleIds = useMemo(() => items.map((i) => i.id), [items]);
  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (prev.size === allVisibleIds.length) return new Set();
      return new Set(allVisibleIds);
    });
  };
  const handleDeleteOne = async (item) => {
    if (!window.confirm("Excluir este diário?")) return;
    await diaryService.deleteFeedAndProject({
      feedId: item.id,
      projectId: item.projectId,
      sourceDiaryId: item.sourceDiaryId || null,
    });
    await loadFeed();
  };
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Excluir ${selectedIds.size} diário(s) selecionado(s)?`)) return;
    const selected = items
      .filter((i) => selectedIds.has(i.id))
      .map((i) => ({
        id: i.id,
        projectId: i.projectId,
        sourceDiaryId: i.sourceDiaryId || null,
      }));
    await diaryService.deleteFeedEntriesBulk(selected);
    await loadFeed();
  };

  // lista de projetos filtrada pela busca da sidebar
  const filteredProjects = useMemo(() => {
    const q = projSearch.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projSearch, projects]);

  return (
    <div className="px-4 md:px-6 py-4 space-y-4">
      {/* topo com voltar */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/dashboard")}
          className="inline-flex items-center gap-2 text-slate-700 hover:text-slate-900 bg-white border border-slate-200 rounded-lg px-3 py-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao Dashboard
        </button>
        <h1 className="text-2xl font-semibold text-slate-900">
          Diário do Projeto
        </h1>
      </div>

      {/* highlights: últimos 3 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {highlights.map((h) => {
          const createdAt = h.createdAt?.toDate
            ? h.createdAt.toDate()
            : h.createdAt?._seconds
            ? new Date(h.createdAt._seconds * 1000)
            : null;
          const preview =
            (h.text || "").length > 160
              ? (h.text || "").slice(0, 160) + "…"
              : h.text || "";
          return (
            <div
              key={h.id}
              className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm"
            >
              <div className="text-xs text-slate-500">
                {createdAt ? createdAt.toLocaleString() : "—"}
              </div>
              <button
                className="mt-1 text-blue-600 hover:underline font-medium"
                onClick={() => gotoProject(h.projectId)}
              >
                {h.projectName || "Projeto"}
              </button>
              <div className="text-xs text-slate-500 mt-0.5">
                {h.authorName || "—"}
              </div>
              <p className="mt-2 text-sm text-slate-700">{preview}</p>
            </div>
          );
        })}
        {highlights.length === 0 && (
          <div className="md:col-span-3 text-sm text-slate-500">
            Nenhum diário recente.
          </div>
        )}
      </div>

      {/* 3 colunas: form | feed | projetos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* coluna esquerda: formulário */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
            <h2 className="text-base font-semibold text-slate-900 mb-3">
              Novo diário
            </h2>
            <DiaryForm
              projects={projects}
              onSubmit={handleCreate}
              defaultProjectId={selectedProjectId || ""}
              disabled={!authReady}
            />
            {!authReady && (
              <p className="mt-2 text-xs text-slate-500">
                Carregando usuário… o botão habilita em instantes.
              </p>
            )}
          </div>
        </div>

        {/* coluna central: feed */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-slate-900">
                  {selectedProjectId
                    ? "Diários do projeto"
                    : "Últimos diários"}
                </h2>
                {selectedProjectId && (
                  <button
                    onClick={() => setSelectedProjectId("")}
                    className="text-xs text-slate-600 hover:underline"
                  >
                    limpar seleção
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
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
            </div>

            {/* barra de ações em massa (apenas admin) */}
            {isAdmin && items.length > 0 && (
              <div className="flex items-center justify-between mb-2 p-2 rounded-md bg-slate-50 border border-slate-200">
                <button
                  onClick={toggleSelectAll}
                  className="text-xs px-3 py-1 rounded-md bg-white border hover:bg-slate-50"
                >
                  {selectedIds.size === items.length
                    ? "Desmarcar todos"
                    : "Selecionar todos"}
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={selectedIds.size === 0}
                  className={`text-xs px-3 py-1 rounded-md ${
                    selectedIds.size === 0
                      ? "bg-slate-100 text-slate-400"
                      : "bg-red-600 text-white hover:bg-red-500"
                  }`}
                >
                  Excluir selecionados ({selectedIds.size})
                </button>
              </div>
            )}

            <div className="h-[70vh] overflow-y-auto pr-1">
              {loadingFeed && (
                <div className="text-sm text-slate-500">Carregando…</div>
              )}
              {!loadingFeed && items.length === 0 && (
                <div className="text-sm text-slate-500">
                  Nenhum diário encontrado.
                </div>
              )}
              {items.map((i) => (
                <DiaryCard
                  key={i.id}
                  item={i}
                  onProjectClick={gotoProject}
                  selectable={isAdmin}
                  selected={selectedIds.has(i.id)}
                  onToggleSelect={() => toggleSelect(i.id)}
                  canDelete={isAdmin}
                  onDelete={() => handleDeleteOne(i)}
                />
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

        {/* coluna direita: seleção de projetos (apenas os permitidos) */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
            <h2 className="text-base font-semibold text-slate-900">
              Projetos ativos
            </h2>

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
              {filteredProjects.length === 0 && (
                <div className="text-sm text-slate-500">
                  Nenhum projeto encontrado.
                </div>
              )}
              <ul className="space-y-1">
                {filteredProjects.map((p) => {
                  const active = selectedProjectId === p.id;
                  return (
                    <li key={p.id}>
                      <button
                        onClick={() =>
                          setSelectedProjectId(active ? "" : p.id)
                        }
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
