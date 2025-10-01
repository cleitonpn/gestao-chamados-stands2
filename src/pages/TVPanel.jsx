// src/pages/TVPanel.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "../config/firebase";
import {
  Activity,
  AlertOctagon,
  ArrowRightCircle,
  Award,
  BarChart3,
  CheckCircle,
  Clock,
  FileText,
  Flag,
  FolderOpen,
  GitPullRequest,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";

/* ============================
   Helpers
   ============================ */
const tsToDate = (v) => {
  if (!v) return null;
  if (v?.toDate) return v.toDate();
  if (v?._seconds) return new Date(v._seconds * 1000);
  if (typeof v === "number") return new Date(v);
  if (typeof v === "string") return new Date(v);
  return null;
};

const timeAgo = (date) => {
  if (!date) return "";
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return "agora";
  const map = [
    [31536000, "ano"],
    [2592000, "mês"],
    [86400, "dia"],
    [3600, "hora"],
    [60, "minuto"],
  ];
  for (const [unit, label] of map) {
    const n = Math.floor(seconds / unit);
    if (n >= 1) return `há ${n} ${label}${n > 1 ? "s" : ""}`;
  }
  return `há ${seconds} seg`;
};

// pega o timestamp mais recente do chamado
const latestTicketDate = (t) =>
  tsToDate(t?.dataUltimaAtualizacao) ||
  tsToDate(t?.updatedAt) ||
  tsToDate(t?.atualizadoEm) ||
  tsToDate(t?.createdAt) ||
  tsToDate(t?.criadoEm) ||
  new Date(0);

/* ============================
   Página
   ============================ */
export default function TVPanel() {
  // KPIs simples (mantidos)
  const [tickets, setTickets] = useState([]);
  const [projectsTotal, setProjectsTotal] = useState(0);

  // Feed de chamados (direita)
  const [activityFeed, setActivityFeed] = useState([]);

  // NOVO: últimos diários (quadro novo)
  const [lastDiaries, setLastDiaries] = useState([]);

  /* ---------------- assinaturas ---------------- */
  // Assinatura dos KPIs básicos dos chamados (coleção "chamados")
  useEffect(() => {
    const qTickets = query(collection(db, "chamados"));
    const unsub = onSnapshot(qTickets, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setTickets(list);
    });
    return () => unsub();
  }, []);

  // Assinatura do total de projetos (coleção "projetos")
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "projetos"), (snap) => {
      setProjectsTotal(snap.size || 0);
    });
    return () => unsub();
  }, []);

  // Feed da direita: 10 últimos chamados abertos/atualizados
  useEffect(() => {
    // usa um campo comum e estável; o array já é resortado no client por segurança
    const qFeed = query(
      collection(db, "chamados"),
      orderBy("updatedAt", "desc"),
      limit(20) // pega mais e a gente filtra para os 10 "mais recentes" pelo helper
    );
    const unsub = onSnapshot(qFeed, (snap) => {
      const raw = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const sorted = raw
        .sort((a, b) => latestTicketDate(b) - latestTicketDate(a))
        .slice(0, 20);
      setActivityFeed(sorted);
    });
    return () => unsub();
  }, []);

  // NOVO: últimos 10 diários (coleção global "diary_feed")
  useEffect(() => {
    const qDiaries = query(
      collection(db, "diary_feed"),
      orderBy("createdAt", "desc"),
      limit(10)
    );
    const unsub = onSnapshot(qDiaries, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setLastDiaries(list);
    });
    return () => unsub();
  }, []);

  /* ---------------- KPIs derivados ---------------- */
  const metrics = useMemo(() => {
    const total = tickets.length;
    const closedSet = new Set(["concluido", "concluído", "arquivado"]);
    const notOpen = new Set(["concluido", "concluído", "cancelado", "arquivado"]);
    const closed = tickets.filter((t) => closedSet.has((t.status || "").toLowerCase())).length;
    const open = tickets.filter((t) => !notOpen.has((t.status || "").toLowerCase())).length;
    const progress = total > 0 ? Math.round((closed / total) * 100) : 0;
    return { total, open, closed, progress };
  }, [tickets]);

  /* ---------------- layout ---------------- */
  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="mx-auto max-w-[1800px] px-6 py-6">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-6 w-6 text-sky-400" />
            <h1 className="text-2xl font-bold tracking-tight">Painel Operacional</h1>
          </div>
          <div className="text-sm text-slate-300">
            Atualizado {timeAgo(new Date())}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6">
          {/* COLUNA ESQUERDA (cards/kpis) */}
          <div className="space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                icon={<FolderOpen className="h-5 w-5" />}
                label="Chamados"
                value={metrics.total}
                tone="sky"
              />
              <KpiCard
                icon={<Activity className="h-5 w-5" />}
                label="Em aberto"
                value={metrics.open}
                tone="amber"
              />
              <KpiCard
                icon={<CheckCircle className="h-5 w-5" />}
                label="Concluídos"
                value={metrics.closed}
                tone="emerald"
              />
              <KpiCard
                icon={<Award className="h-5 w-5" />}
                label="Projetos ativos"
                value={projectsTotal}
                tone="violet"
              />
            </div>

            {/* Progresso geral */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-emerald-400" />
                  <h2 className="text-lg font-semibold">Taxa de conclusão</h2>
                </div>
                <div className="text-xl font-bold">{metrics.progress}%</div>
              </div>
              <div className="mt-3 h-2 w-full bg-white/10 rounded">
                <div
                  className="h-2 rounded bg-emerald-500"
                  style={{ width: `${metrics.progress}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-300">
                <span className="inline-flex items-center gap-1">
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                  Melhorando
                </span>
                <span className="inline-flex items-center gap-1">
                  <TrendingDown className="h-4 w-4 text-rose-400" />
                  Picos de fila esporádicos
                </span>
              </div>
            </div>

            {/* ====== QUADRO NOVO: ÚLTIMOS DIÁRIOS ====== */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-sky-400" />
                  <h2 className="text-lg font-semibold">Últimos Diários</h2>
                </div>
                <div className="text-xs text-slate-300">10 mais recentes</div>
              </div>

              {lastDiaries.length === 0 ? (
                <div className="text-slate-300 text-sm">Nenhum diário recente.</div>
              ) : (
                <ul className="divide-y divide-white/10">
                  {lastDiaries.map((d) => {
                    const when = tsToDate(d.createdAt);
                    const preview =
                      (d.text || "").length > 160
                        ? (d.text || "").slice(0, 160) + "…"
                        : d.text || "";
                    return (
                      <li key={d.id} className="py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sky-300 text-xs">
                              {d.projectName || d.projectId}
                            </div>
                            <div className="text-sm font-medium">
                              {d.authorName || "—"}
                              {d.authorRole ? (
                                <span className="text-slate-300 font-normal">
                                  {" "}
                                  · {d.authorRole}
                                </span>
                              ) : null}
                            </div>
                            <p className="text-sm text-slate-200 mt-1 break-words">
                              {preview}
                            </p>
                            {d.linkUrl && (
                              <a
                                href={d.linkUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-sky-300 hover:text-sky-200 mt-1"
                              >
                                <ArrowRightCircle className="h-3 w-3" />
                                Abrir link
                              </a>
                            )}
                          </div>
                          <div className="text-xs text-slate-400 whitespace-nowrap">
                            {timeAgo(when)}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* (Removidos: Top executores / Áreas que mais abriram) */}
          </div>

          {/* COLUNA DIREITA (feed dos chamados) */}
          <div className="space-y-6">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 h-[84vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <GitPullRequest className="h-5 w-5 text-amber-400" />
                  <h2 className="text-lg font-semibold">Feed de Atividades</h2>
                </div>
                <div className="text-xs text-slate-300">10 últimos</div>
              </div>

              {activityFeed.length === 0 ? (
                <div className="text-slate-300 text-sm">Sem atividades recentes.</div>
              ) : (
                <ul className="divide-y divide-white/10">
                  {activityFeed.map((t) => {
                    const when = latestTicketDate(t);
                    return (
                      <li key={t.id} className="py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs text-slate-300">
                              {(t.projeto || t.projetoNome || t.evento || "Projeto").toString()}
                            </div>
                            <div className="text-sm font-medium">
                              #{t.numero || t.id} — {t.titulo || t.título || "Chamado"}
                            </div>
                            <div className="text-xs text-slate-400 mt-1">
                              {t.status || "aberto"} · {t.area || "—"} · {t.prioridade || "—"}
                            </div>
                          </div>
                          <div className="text-xs text-slate-400 whitespace-nowrap">
                            {timeAgo(when)}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Cartão pequeno de status gerais (opcional) */}
            <div className="grid grid-cols-3 gap-3">
              <MiniCard icon={<Clock className="h-4 w-4" />} label="Takt" value="5m" />
              <MiniCard icon={<Users className="h-4 w-4" />} label="Equipes" value="On-line" />
              <MiniCard icon={<AlertOctagon className="h-4 w-4" />} label="SLA risco" value="ok" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================
   UI Helpers
   ============================ */
function KpiCard({ icon, label, value, tone = "sky" }) {
  const tones = {
    sky: "bg-sky-500/20 text-sky-300",
    amber: "bg-amber-500/20 text-amber-300",
    emerald: "bg-emerald-500/20 text-emerald-300",
    violet: "bg-violet-500/20 text-violet-300",
  };
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <div className={`p-2 rounded-lg ${tones[tone]}`}>{icon}</div>
        <span className="text-2xl font-bold tabular-nums">{value}</span>
      </div>
      <div className="mt-2 text-sm text-slate-300">{label}</div>
    </div>
  );
}

function MiniCard({ icon, label, value }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-3">
      <div className="flex items-center justify-between">
        <div className="text-slate-300 text-xs">{label}</div>
        <div className="text-slate-200">{icon}</div>
      </div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}
