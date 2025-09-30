import React from "react";

export default function DiaryCard({ item, onProjectClick }) {
  const createdAt = item.createdAt?.toDate
    ? item.createdAt.toDate()
    : item.createdAt?._seconds
    ? new Date(item.createdAt._seconds * 1000)
    : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 mb-3 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onProjectClick?.(item.projectId)}
            className="text-blue-600 hover:underline font-medium"
            title="Abrir projeto"
          >
            {item.projectName || "Projeto"}
          </button>
          {item.area && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              área: {item.area}
            </span>
          )}
          {item.atribuidoA && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-sky-50 text-sky-700 border border-sky-200">
              atribuído a: {item.atribuidoA}
            </span>
          )}
        </div>
        <div className="text-xs text-slate-500">
          {item.authorName || "—"} {createdAt ? `· ${createdAt.toLocaleString()}` : ""}
        </div>
      </div>

      <p className="mt-3 whitespace-pre-wrap text-slate-800">{item.text}</p>

      {(item.linkUrl || (item.attachments && item.attachments.length > 0)) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.linkUrl && (
            <a
              href={item.linkUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs px-2 py-1 rounded bg-white border border-slate-200 hover:bg-slate-50"
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
              className="text-xs px-2 py-1 rounded bg-white border border-slate-200 hover:bg-slate-50"
            >
              {f.name || `Arquivo ${i + 1}`}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
