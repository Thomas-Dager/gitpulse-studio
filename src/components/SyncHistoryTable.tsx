"use client";

import { ExternalLink, History } from "lucide-react";
import type { SyncLogEntry } from "@/types";

interface SyncHistoryTableProps {
  logs: SyncLogEntry[];
}

export function SyncHistoryTable({ logs }: SyncHistoryTableProps) {
  return (
    <div className="rounded-xl border border-zinc-800/90 bg-[#111114] p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-zinc-100">
            Historial de Sincronizaciones
          </h2>
        </div>
        <span className="text-xs text-zinc-500">Últimos {logs.length} eventos</span>
      </div>

      {logs.length === 0 ? (
        <div className="py-8 text-center text-xs text-zinc-500">
          Todavía no hay sincronizaciones registradas. Sube tu primera app para ver el historial aquí.
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="pb-2.5 font-medium">Proyecto</th>
                <th className="pb-2.5 font-medium">Acción</th>
                <th className="pb-2.5 font-medium">Commit / Mensaje</th>
                <th className="pb-2.5 font-medium">Rama / Tag</th>
                <th className="pb-2.5 font-medium">Estado</th>
                <th className="pb-2.5 font-medium text-right">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-zinc-900/40">
                  <td className="py-2.5 pr-3 font-medium text-zinc-200">
                    <div className="flex items-center gap-1.5">
                      <span>{log.projectName}</span>
                      {log.repoUrl && (
                        <a
                          href={log.repoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-zinc-500 hover:text-emerald-400"
                          title="Abrir repositorio en GitHub"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-[11px] text-zinc-400">
                    {log.action}
                  </td>
                  <td className="max-w-xs py-2.5 pr-3">
                    <div className="flex items-center gap-2">
                      {log.commitHash && (
                        <code className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-emerald-400">
                          {log.commitHash}
                        </code>
                      )}
                      <span className="truncate text-zinc-300" title={log.errorDetails || log.commitMessage}>
                        {log.commitMessage}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-[11px] text-zinc-400">
                    {log.branch}
                    {log.tag ? ` (${log.tag})` : ""}
                  </td>
                  <td className="py-2.5 pr-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        log.status === "SUCCESS"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : log.status === "BLOCKED"
                          ? "bg-amber-500/15 text-amber-300"
                          : "bg-red-500/15 text-red-300"
                      }`}
                    >
                      {log.status}
                    </span>
                  </td>
                  <td className="py-2.5 text-right text-zinc-500">
                    {new Date(log.createdAt).toLocaleString("es-AR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
