// src/components/DiaryForm.jsx
import React, { useEffect, useMemo, useState } from "react";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../config/firebase";

export default function DiaryForm({
  projects,
  onSubmit,
  defaultProjectId = null,
  disabled = false,       // bloqueia o submit enquanto auth não estiver pronto
  maxImages = 5,          // limite de imagens por envio
  maxFileSizeMB = 8,      // limite por arquivo
}) {
  const [projectId, setProjectId] = useState(defaultProjectId || "");
  const [text, setText] = useState("");
  const [area, setArea] = useState("");
  const [atribuidoA, setAtribuidoA] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  const [files, setFiles] = useState([]); // [{file, preview, error}]
  const [uploading, setUploading] = useState(false);

  // atualiza projeto quando muda o default
  useEffect(() => {
    if (defaultProjectId) setProjectId(defaultProjectId);
  }, [defaultProjectId]);

  useEffect(() => {
    return () => {
      // revoke previews ao desmontar
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
        next.push({ file, preview: null, error: `Tamanho máximo: ${maxFileSizeMB}MB` });
        continue;
      }
      if (next.filter((x) => !x.error).length >= maxImages) break;
      next.push({ file, preview: URL.createObjectURL(file), error: null });
    }
    // corta se passar do limite
    const ok = next.filter((x) => !x.error).slice(0, maxImages);
    const errs = next.filter((x) => x.error);
    setFiles([...ok, ...errs]);
    e.target.value = ""; // permite re-selecionar o mesmo arquivo
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

  async function uploadSelectedImages(projectId) {
    // faz upload das imagens válidas e retorna [{url, name, contentType, type:'image', size}]
    const valid = files.filter((f) => !f.error && f.file && f.file.type.startsWith("image/"));
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
        const path = `diary/${projectId}/${stamp}_${seq}_${safeName}`;
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

    // valida link (se houver)
    if (linkUrl && !/^https?:\/\//i.test(linkUrl)) {
      alert("Informe um link válido (http/https).");
      return;
    }

    // 1) sobe imagens (se houver)
    const attachments = await uploadSelectedImages(projectId);

    // 2) envia payload para o pai
    const selected = projects.find((p) => p.id === projectId);
    await onSubmit({
      projectId,
      projectName: selected?.name || "",
      text: text.trim(),
      area: area || null,
      atribuidoA: atribuidoA || null,
      linkUrl: linkUrl || null,
      attachments, // <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
    });

    // 3) limpa campos (mantém o projeto)
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

      {/* Upload de imagens */}
      <div>
        <label className="text-xs text-slate-500">Imagens (opcional)</label>
        <input
          type="file"
          accept="image/*"
          multiple
          className="mt-1 block w-full text-sm"
          onChange={handleFilesSelected}
        />
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
                  <div className="h-24 flex items-center justify-center text-xs text-slate-500">
                    {f.error ? f.error : f.file?.name}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeFile(idx)}
                  className="absolute top-1 right-1 bg-black/60 text-white text-xs rounded px-2 py-0.5"
                  title="Remover"
                >
                  x
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
