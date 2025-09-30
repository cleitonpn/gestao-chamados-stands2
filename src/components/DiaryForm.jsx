// src/components/DiaryForm.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../config/firebase";
import { Upload, X } from "lucide-react";

export default function DiaryForm({
  projects,
  onSubmit,
  defaultProjectId = null,
  disabled = false,
  maxImages = 5,
  maxFileSizeMB = 8,
}) {
  const [projectId, setProjectId] = useState(defaultProjectId || "");
  const [text, setText] = useState("");
  const [area, setArea] = useState("");
  const [atribuidoA, setAtribuidoA] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  const [files, setFiles] = useState([]); // [{file, preview, error}]
  const [uploading, setUploading] = useState(false);

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (defaultProjectId) setProjectId(defaultProjectId);
  }, [defaultProjectId]);

  useEffect(() => {
    return () => {
      files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
    };
  }, [files]);

  const canSend = useMemo(() => {
    const hasText = text.trim().length > 0;
    return !disabled && !uploading && projectId && hasText;
  }, [disabled, uploading, projectId, text]);

  function handleFilesSelected(e) {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;

    const next = [...files];
    for (const file of selected) {
      if (!file.type.startsWith("image/")) {
        next.push({ file, preview: null, error: "Arquivo não é uma imagem." });
        continue;
      }
      if (file.size > maxFileSizeMB * 1024 * 1024) {
        next.push({ file, preview: null, error: `Máx. ${maxFileSizeMB}MB` });
        continue;
      }
      if (next.filter((x) => !x.error).length >= maxImages) break;
      next.push({ file, preview: URL.createObjectURL(file), error: null });
    }
    const ok = next.filter((x) => !x.error).slice(0, maxImages);
    const errs = next.filter((x) => x.error);
    setFiles([...ok, ...errs]);
    if (e.target) e.target.value = "";
  }

  function removeFile(idx) {
    setFiles((prev) => {
      const copy = [...prev];
      const item = copy[idx];
      if (item?.preview) URL.revokeObjectURL(item.preview);
      copy.splice(idx, 1);
      return copy;
    });
  }

  async function uploadSelectedImages(pid) {
    const valid = files.filter((f) => !f.error && f.file?.type?.startsWith("image/"));
    if (valid.length === 0) return [];

    setUploading(true);
    try {
      const uploaded = [];
      const stamp = Date.now();
      let seq = 0;

      for (const item of valid) {
        seq += 1;
        const file = item.file;
        const safeName = file.name.replace(/[^\w.\-]/g, "_");
        const path = `diary/${pid}/${stamp}_${seq}_${safeName}`;
        const storageRef = ref(storage, path);

        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);

        uploaded.push({
          url,
          name: file.name,
          contentType: file.type,
          size: file.size,
          type: "image",
          path,
        });
      }
      return uploaded;
    } finally {
      setUploading(false);
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSend) return;

    if (linkUrl && !/^https?:\/\//i.test(linkUrl)) {
      alert("Informe um link válido (http/https).");
      return;
    }

    const attachments = await uploadSelectedImages(projectId);

    const selected = projects.find((p) => p.id === projectId);
    await onSubmit({
      projectId,
      projectName: selected?.name || "",
      text: text.trim(),
      area: area || null,
      atribuidoA: atribuidoA || null,
      linkUrl: linkUrl || null,
      attachments,
    });

    setText("");
    setArea("");
    setAtribuidoA("");
    setLinkUrl("");
    files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
    setFiles([]);
  };

  const imagesCount = files.filter((f) => !f.error && f.file?.type?.startsWith("image/")).length;

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

      {/* Upload via botão */}
      <div>
        <label className="text-xs text-slate-500">Imagens (opcional)</label>

        {/* input escondido */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFilesSelected}
        />

        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-2"
          >
            <Upload className="h-4 w-4" />
            Upload arquivo(s)
          </button>

          {imagesCount > 0 && (
            <button
              type="button"
              onClick={() => {
                files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
                setFiles([]);
              }}
              className="text-xs rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1"
            >
              Limpar imagens
            </button>
          )}
        </div>

        <div className="mt-2 text-xs text-slate-500">
          {imagesCount}/{maxImages} imagens selecionadas (máx. {maxFileSizeMB}MB por arquivo)
        </div>

        {/* previews / erros */}
        {files.length > 0 && (
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {files.map((f, idx) => (
              <div key={idx} className="relative border rounded-lg overflow-hidden bg-white">
                {f.preview ? (
                  <img src={f.preview} alt={f.file?.name} className="w-full h-24 object-cover" />
                ) : (
                  <div className="h-24 flex items-center justify-center text-xs text-slate-500 px-2 text-center">
                    {f.error ? f.error : f.file?.name}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => removeFile(idx)}
                  className="absolute top-1 right-1 bg-black/60 text-white rounded p-1"
                  title="Remover"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
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
          {uploading ? "Enviando…" : "Publicar diário"}
        </button>
        <span className="text-xs text-slate-500">
          O diário será salvo no projeto e no feed.
        </span>
      </div>
    </form>
  );
}
