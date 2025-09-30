// src/components/DiaryForm.jsx
import React, { useEffect, useState } from "react";

export default function DiaryForm({
  projects,
  onSubmit,
  defaultProjectId = null,
  disabled = false, // desabilita o submit enquanto o auth não estiver pronto
}) {
  const [projectId, setProjectId] = useState(defaultProjectId || "");
  const [text, setText] = useState("");
  const [area, setArea] = useState("");
  const [atribuidoA, setAtribuidoA] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  // sempre que vier um novo defaultProjectId, atualiza o select
  useEffect(() => {
    if (defaultProjectId) setProjectId(defaultProjectId);
  }, [defaultProjectId]);

  // pode enviar somente quando houver projeto + texto e o formulário não estiver desabilitado
  const canSend = !disabled && projectId && text.trim().length > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSend) return;

    const selected = projects.find((p) => p.id === projectId);
    await onSubmit({
      projectId,
      projectName: selected?.name || "",
      text: text.trim(),
      area: area || null,
      atribuidoA: atribuidoA || null,
      linkUrl: linkUrl || null,
    });

    // limpa apenas campos de conteúdo; mantém o projeto selecionado
    setText("");
    setArea("");
    setAtribuidoA("");
    setLinkUrl("");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid md:grid-cols-4 gap-3">
        <div className="md:col-span-2">
          <label className="text-xs text-slate-500">Projeto</label>
          <select
            className="mt-1 w-full rounded-lg bg-white border border-slate-200 text-slate-800 p-2"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">Selecione…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-slate-500">Área</label>
          <input
            className="mt-1 w-full rounded-lg bg-white border border-slate-200 text-slate-800 p-2"
            placeholder="ex.: produção, montagem, elétrica…"
            value={area}
            onChange={(e) => setArea(e.target.value)}
          />
        </div>

        <div>
          <label className="text-xs text-slate-500">Atribuído a</label>
          <input
            className="mt-1 w-full rounded-lg bg-white border border-slate-200 text-slate-800 p-2"
            placeholder="nome/usuário"
            value={atribuidoA}
            onChange={(e) => setAtribuidoA(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-slate-500">Texto do diário</label>
        <textarea
          rows={6}
          className="mt-1 w-full rounded-lg bg-white border border-slate-200 text-slate-800 p-3"
          placeholder="Escreva aqui…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>

      <div>
        <label className="text-xs text-slate-500">Link (opcional)</label>
        <input
          className="mt-1 w-full rounded-lg bg-white border border-slate-200 text-slate-800 p-2"
          placeholder="https://…"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!canSend}
          className={`px-3 py-2 rounded-lg ${
            canSend
              ? "bg-blue-600 text-white hover:bg-blue-500"
              : "bg-slate-100 text-slate-400 cursor-not-allowed"
          }`}
        >
          Publicar diário
        </button>
        <span className="text-xs text-slate-500">
          O diário será salvo no projeto e no feed.
        </span>
      </div>
    </form>
  );
}
