"use client";

import { useState } from "react";
import { ExternalLink, KeyRound, Loader2, Save, X } from "lucide-react";
import type { GitHubAuthStatus, RepoVisibility } from "@/types";

interface SettingsModalProps {
  initialConfig: {
    rootWorkspacePath: string;
    defaultVisibility: RepoVisibility;
    defaultBranch: string;
    autoGenerateCommit: boolean;
    blockOnSecrets: boolean;
    hasGithubToken: boolean;
    hasGeminiApiKey: boolean;
  };
  authStatus: GitHubAuthStatus;
  onClose: () => void;
  onSaved: () => void;
}

export function SettingsModal({
  initialConfig,
  authStatus,
  onClose,
  onSaved,
}: SettingsModalProps) {
  const [rootWorkspacePath, setRootWorkspacePath] = useState(initialConfig.rootWorkspacePath);
  const [defaultVisibility, setDefaultVisibility] = useState<RepoVisibility>(
    initialConfig.defaultVisibility
  );
  const [defaultBranch, setDefaultBranch] = useState(initialConfig.defaultBranch);
  const [githubToken, setGithubToken] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [autoGenerateCommit, setAutoGenerateCommit] = useState(initialConfig.autoGenerateCommit);
  const [blockOnSecrets, setBlockOnSecrets] = useState(initialConfig.blockOnSecrets);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const payload: Record<string, unknown> = {
        rootWorkspacePath,
        defaultVisibility,
        defaultBranch,
        autoGenerateCommit,
        blockOnSecrets,
      };
      if (githubToken.trim()) {
        payload.githubToken = githubToken.trim();
      }
      if (geminiApiKey.trim()) {
        payload.geminiApiKey = geminiApiKey.trim();
      }

      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "No se pudo guardar la configuración");
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <form
        onSubmit={handleSave}
        className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-[#111114] p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <KeyRound className="h-5 w-5 text-emerald-400" />
            <h2 className="text-lg font-semibold text-zinc-100">
              Configuración de GitPulse
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

        <div className="mt-5 space-y-4 text-sm">
          <div>
            <label className="block text-xs font-medium text-zinc-400">
              Carpeta Raíz de Aplicaciones (Workspace)
            </label>
            <input
              type="text"
              value={rootWorkspacePath}
              onChange={(e) => setRootWorkspacePath(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-200 focus:border-emerald-500/60 focus:outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400">
                Visibilidad por defecto
              </label>
              <select
                value={defaultVisibility}
                onChange={(e) => setDefaultVisibility(e.target.value as RepoVisibility)}
                className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 focus:border-emerald-500/60 focus:outline-none"
              >
                <option value="public">Público (Por defecto)</option>
                <option value="private">Privado</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400">
                Rama Principal
              </label>
              <input
                type="text"
                value={defaultBranch}
                onChange={(e) => setDefaultBranch(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-200 focus:border-emerald-500/60 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-zinc-400">
                Token de GitHub (scope: <code>repo</code>)
              </label>
              <a
                href={authStatus.tokenCreationUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 hover:underline"
              >
                Crear Token en GitHub
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <input
              type="password"
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
              placeholder={
                initialConfig.hasGithubToken
                  ? "•••••••••••• (Token guardado; escribe para reemplazar)"
                  : "ghp_... o github_pat_..."
              }
              className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-200 placeholder-zinc-600 focus:border-emerald-500/60 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400">
              Gemini API Key (Opcional, para commits redactados con IA)
            </label>
            <input
              type="password"
              value={geminiApiKey}
              onChange={(e) => setGeminiApiKey(e.target.value)}
              placeholder={
                initialConfig.hasGeminiApiKey
                  ? "•••••••••••• (Clave guardada; escribe para reemplazar)"
                  : "AIza... (Si queda vacío usa motor heurístico offline)"
              }
              className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-200 placeholder-zinc-600 focus:border-emerald-500/60 focus:outline-none"
            />
          </div>

          <div className="space-y-2 rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-3">
            <label className="flex items-center justify-between text-xs text-zinc-300">
              <span>Generar mensajes Conventional Commits automáticamente</span>
              <input
                type="checkbox"
                checked={autoGenerateCommit}
                onChange={(e) => setAutoGenerateCommit(e.target.checked)}
                className="h-4 w-4 accent-emerald-500"
              />
            </label>
            <label className="flex items-center justify-between text-xs text-zinc-300">
              <span>Bloquear push si se detectan secretos o .env expuestos</span>
              <input
                type="checkbox"
                checked={blockOnSecrets}
                onChange={(e) => setBlockOnSecrets(e.target.checked)}
                className="h-4 w-4 accent-emerald-500"
              />
            </label>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Guardar Cambios
          </button>
        </div>
      </form>
    </div>
  );
}
