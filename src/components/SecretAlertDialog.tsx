"use client";

import { AlertTriangle, ShieldAlert, X } from "lucide-react";
import type { SecretFinding } from "@/types";

interface SecretAlertDialogProps {
  projectName: string;
  projectPath: string;
  findings: SecretFinding[];
  onClose: () => void;
  onForceSync: (projectPath: string) => void;
}

export function SecretAlertDialog({
  projectName,
  projectPath,
  findings,
  onClose,
  onForceSync,
}: SecretAlertDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl border border-red-500/40 bg-[#111114] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-red-500/15 p-2 text-red-400">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">
                Push Bloqueado: Secretos Detectados
              </h2>
              <p className="text-xs text-zinc-400">
                Proyecto: <span className="font-mono text-zinc-200">{projectName}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-4 text-sm text-zinc-300">
          Para proteger tu cuenta antes de subir a un repositorio <strong>público</strong>, GitPulse detuvo la publicación porque encontró posibles claves privadas o archivos <code className="text-red-300">.env</code> expuestos:
        </p>

        <div className="mt-4 max-h-60 space-y-2 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          {findings.map((finding, idx) => (
            <div
              key={`${finding.file}-${finding.line}-${idx}`}
              className="flex items-start justify-between gap-3 rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs"
            >
              <div className="min-w-0">
                <div className="font-medium text-red-300">{finding.type}</div>
                <div className="truncate font-mono text-zinc-400">
                  {finding.file}:{finding.line}
                </div>
              </div>
              <code className="shrink-0 rounded bg-zinc-900 px-2 py-0.5 font-mono text-[11px] text-amber-300">
                {finding.snippet}
              </code>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
          <span>
            Recomendado: mueve las claves a un archivo <code>.env</code> (ignorado por Git) y vuelve a intentar.
          </span>
        </div>

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
          >
            Cancelar y revisar código
          </button>
          <button
            type="button"
            onClick={() => onForceSync(projectPath)}
            className="rounded-lg border border-red-500/40 bg-red-500/15 px-4 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/25"
          >
            Es un falso positivo, forzar subida
          </button>
        </div>
      </div>
    </div>
  );
}
