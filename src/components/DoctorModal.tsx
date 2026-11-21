"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Stethoscope, X, XCircle } from "lucide-react";
import type { DoctorReport } from "@/types";

interface DoctorModalProps {
  onClose: () => void;
}

export function DoctorModal({ onClose }: DoctorModalProps) {
  const [report, setReport] = useState<DoctorReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/doctor")
      .then((r) => r.json())
      .then((data) => setReport(data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl border border-zinc-800 bg-[#111114] p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Stethoscope className="h-5 w-5 text-emerald-400" />
            <h2 className="text-lg font-semibold text-zinc-100">
              Diagnóstico del Sistema (Doctor)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Analizando entorno local...
            </div>
          ) : report ? (
            <div className="space-y-3">
              {report.checks.map((check) => (
                <div
                  key={check.name}
                  className={`rounded-lg border p-3 ${
                    check.ok
                      ? "border-emerald-500/20 bg-emerald-500/5"
                      : "border-amber-500/30 bg-amber-500/10"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {check.ok ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    ) : (
                      <XCircle className="h-4 w-4 shrink-0 text-amber-400" />
                    )}
                    <span className="text-sm font-medium text-zinc-100">
                      {check.name}
                    </span>
                  </div>
                  <p className="mt-1 pl-6 text-xs text-zinc-300">{check.detail}</p>
                  {check.fixHint && (
                    <p className="mt-1 pl-6 font-mono text-[11px] text-amber-300">
                      Solución: {check.fixHint}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-red-400">No se pudo obtener el diagnóstico.</p>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
