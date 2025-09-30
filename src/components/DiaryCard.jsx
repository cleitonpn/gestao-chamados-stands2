// src/components/DiaryCard.jsx
import React from "react";
import { Trash2 } from "lucide-react";

export default function DiaryCard({
  item,
  onProjectClick,
  selectable = false,
  selected = false,
  onToggleSelect = () => {},
  canDelete = false,
  onDelete = () => {},
}) {
  const createdAt = item.createdAt?.toDate
    ? item.createdAt.toDate()
    : item.createdAt?._seconds
    ? new Date(item.createdAt._seconds * 1000)
    : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 mb-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          {selectable && (
            <input
              type="checkbox"
              className="mt-1.5 h-4 w-4"
              checked={selected}
              onChange={onToggleSelect}
              aria-label="Selecionar diário"
            />
          )}
          <div>
            <button
              onClick={() => onProjectClick?.(item.projectId)}
              className="text-blue-600 hover:underline font-medium"
              title="Abrir projeto"
            >
              {item.projectName || "Projeto"}
            </button>
            <div className="text-xs text-slate-500">
              {item.authorName || "—"} {createdAt ? `· ${createdAt.toLocaleString()}` : ""}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
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
          </div>
        </div>

        {canDelete && (
          <button
            onClick={onDelete}
            className="text-slate-500 hover:text-red-600 p-1 rounded"
            title="Excluir este diário"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
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
