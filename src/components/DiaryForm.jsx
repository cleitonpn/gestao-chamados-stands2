import React, { useState, useEffect } from "react";

export default function DiaryForm({ projects, onSubmit, defaultProjectId = null }) {
  const [projectId, setProjectId] = useState(defaultProjectId || "");
  const [text, setText] = useState("");
  const [area, setArea] = useState("");
  const [atribuidoA, setAtribuidoA] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  useEffect(() => {
    if (defaultProjectId) setProjectId(defaultProjectId);
  }, [defaultProjectId]);

  const canSend = projectId && text.trim().length > 0;

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
            className="mt-1 w-full rounded-lg bg-white border
