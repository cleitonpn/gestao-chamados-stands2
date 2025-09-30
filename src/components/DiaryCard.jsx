import React from "react";

export default function DiaryCard({ item, onProjectClick }) {
  const createdAt = item.createdAt?.toDate
    ? item.createdAt.toDate()
    : (item.createdAt?._seconds ? new Date(item.createdAt._seconds * 1000) : null);

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 mb-3">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onProjectClick?.(item.projectId)}
            className="text-indigo-300 hover:underline font-semibold"
            title="Abrir projeto"
          >
            {item.projectName || "Projeto"}
          </button>
          {item.area && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-900/40 border border-emerald-700">
              área: {item.area}
            </span>
          )}
          {item.atribuidoA && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-sky-900/40 border border-sky-700">
              atribuída a: {item.atribuidoA}
            </span>
          )}
        </div>
        <div className="text-xs text-neutral-400">
          {item.authorName || "—"} · {createdAt ? createdAt.toLocaleString() : "—"}
        </div>
      </div>

      <p className="mt-3 whitespace-pre-wrap text-neutral-200">{item.text}</p>

      {(item.linkUrl || (item.attachments && item.attachments.length > 0)) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.linkUrl && (
            <a
              href={item.linkUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs px-2 py-1 rounded bg-neutral-800 border border-neutral-700 hover:bg-neutral-700"
            >
              Abrir link
            </a>
          )}
          {(item.attachments || []).map((f, i) => (
            <a
              key={i}
              href={f.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs px-2 py-1 rounded bg-neutral-800 border border-neutral-700 hover:bg-neutral-700"
            >
              {f.name || `Arquivo ${i + 1}`}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
