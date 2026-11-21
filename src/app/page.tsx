"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FolderSearch,
  GitBranch,
  Github,
  Loader2,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Stethoscope,
  Terminal,
  UploadCloud,
} from "lucide-react";
import { DoctorModal } from "@/components/DoctorModal";
import { ProjectCard } from "@/components/ProjectCard";
import { SecretAlertDialog } from "@/components/SecretAlertDialog";
import { SettingsModal } from "@/components/SettingsModal";
import { SyncHistoryTable } from "@/components/SyncHistoryTable";
import type {
  GitHubAuthStatus,
  ProjectGitStatus,
  RepoVisibility,
  SecretFinding,
  SyncLogEntry,
  SyncResult,
} from "@/types";

interface DashboardPayload {
  config: {
    rootWorkspacePath: string;
    defaultVisibility: RepoVisibility;
    defaultBranch: string;
    githubUsername: string | null;
    autoGenerateCommit: boolean;
    blockOnSecrets: boolean;
    hasGithubToken: boolean;
    hasGeminiApiKey: boolean;
  };
  authStatus: GitHubAuthStatus;
  gitInfo: {
    gitBinary: string | null;
    gitVersion: string | null;
    userName: string | null;
    userEmail: string | null;
  };
  projects: ProjectGitStatus[];
  logs: SyncLogEntry[];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncingPaths, setSyncingPaths] = useState<Record<string, boolean>>({});
  const [syncingAll, setSyncingAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "untracked" | "synced">("all");
  const [toast, setToast] = useState<{
    type: "success" | "error";
    title: string;
    detail?: string;
    repoUrl?: string;
  } | null>(null);

  const [secretAlert, setSecretAlert] = useState<{
    projectName: string;
    projectPath: string;
    findings: SecretFinding[];
  } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showDoctor, setShowDoctor] = useState(false);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/projects", { cache: "no-store" });
      const payload = (await res.json()) as DashboardPayload;
      if (res.ok) {
        setData(payload);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  const handleSyncProject = async (params: {
    projectPath: string;
    customMessage?: string;
    branch?: string;
    tag?: string;
    forceIgnoreSecrets?: boolean;
  }): Promise<SyncResult | undefined> => {
    setSyncingPaths((prev) => ({ ...prev, [params.projectPath]: true }));
    setToast(null);

    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      const result = (await res.json()) as SyncResult;

      if (result.action === "BLOCKED_SECRET" && result.blockedSecrets) {
        setSecretAlert({
          projectName: result.projectName,
          projectPath: params.projectPath,
          findings: result.blockedSecrets,
        });
        await loadWorkspace();
        return result;
      }

      if (!result.success) {
        setToast({
          type: "error",
          title: `Error al sincronizar ${result.projectName}`,
          detail: result.error,
        });
      } else {
        setToast({
          type: "success",
          title:
            result.action === "NO_CHANGES"
              ? `${result.projectName} ya está al día`
              : `${result.projectName} sincronizado (${result.branch})`,
          detail: result.commitMessage
            ? `${result.commitHash ? `[${result.commitHash}] ` : ""}${result.commitMessage}`
            : undefined,
          repoUrl: result.repoUrl,
        });
      }

      await loadWorkspace();
      return result;
    } catch (err) {
      setToast({
        type: "error",
        title: "Error de conexión",
        detail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSyncingPaths((prev) => ({ ...prev, [params.projectPath]: false }));
    }
    return undefined;
  };

  const handleSyncAll = async () => {
    setSyncingAll(true);
    setToast(null);
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncAll: true }),
      });
      const payload = (await res.json()) as {
        totalProcessed: number;
        succeeded: number;
        failed: number;
      };
      setToast({
        type: payload.failed > 0 ? "error" : "success",
        title: `Sincronización masiva completada`,
        detail: `${payload.succeeded} exitosas, ${payload.failed} con error o bloqueadas (de ${payload.totalProcessed} apps pendientes).`,
      });
      await loadWorkspace();
    } catch (err) {
      setToast({
        type: "error",
        title: "Error en sincronización masiva",
        detail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSyncingAll(false);
    }
  };

  const metrics = useMemo(() => {
    const projects = data?.projects || [];
    const total = projects.length;
    const untracked = projects.filter((p) => p.status === "untracked").length;
    const pending = projects.filter((p) => p.status === "dirty" || p.status === "ahead").length;
    const synced = projects.filter((p) => p.status === "synced").length;
    return { total, untracked, pending, synced, actionNeeded: untracked + pending };
  }, [data]);

  const filteredProjects = useMemo(() => {
    const projects = data?.projects || [];
    return projects.filter((p) => {
      const matchesSearch =
        !searchQuery.trim() ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.detectedStack.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;
      if (statusFilter === "pending") return p.status === "dirty" || p.status === "ahead";
      if (statusFilter === "untracked") return p.status === "untracked";
      if (statusFilter === "synced") return p.status === "synced";
      return true;
    });
  }, [data, searchQuery, statusFilter]);

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
      {/* Header Principal */}
      <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-[#09090b]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/15 text-emerald-400">
              <Github className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-zinc-100">
                  GitPulse Studio
                </h1>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                  Auto-Publicación Pública
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Workspace:{" "}
                <code className="text-zinc-300">
                  {data?.config.rootWorkspacePath || "D:\\Antigravity"}
                </code>
                {data?.gitInfo.userName && (
                  <>
                    {" · "}
                    <span>Git: {data.gitInfo.userName}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Estado de Conexión GitHub */}
            {data?.authStatus && (
              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  data.authStatus.authenticatedForApi
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    data.authStatus.authenticatedForApi ? "bg-emerald-400" : "bg-amber-400"
                  }`}
                />
                {data.authStatus.authenticatedForApi
                  ? `@${data.authStatus.username}`
                  : "Configurar Token GitHub"}
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowDoctor(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
            >
              <Stethoscope className="h-3.5 w-3.5 text-emerald-400" />
              Doctor
            </button>

            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
            >
              <Settings className="h-3.5 w-3.5" />
              Ajustes
            </button>

            <button
              type="button"
              onClick={loadWorkspace}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Escanear
            </button>

            <button
              type="button"
              onClick={handleSyncAll}
              disabled={syncingAll || metrics.actionNeeded === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {syncingAll ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <UploadCloud className="h-3.5 w-3.5" />
              )}
              Sincronizar Pendientes ({metrics.actionNeeded})
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        {/* Aviso si falta Token GitHub */}
        {data && !data.authStatus.authenticatedForApi && (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <div>
                <p className="font-semibold text-amber-200">
                  Falta configurar tu Token de GitHub para crear repositorios públicos automáticamente
                </p>
                <p className="mt-1 text-amber-300/80">
                  Tus proyectos que ya tienen remoto pueden actualizarse con Git Credential Manager, pero para que GitPulse cree repos nuevos en tu cuenta automáticamente necesitas un Token con permiso <code>repo</code>.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={data.authStatus.tokenCreationUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-amber-400/40 bg-amber-400/15 px-3 py-1.5 font-medium text-amber-200 hover:bg-amber-400/25"
              >
                Generar Token en GitHub
              </a>
              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className="rounded-lg bg-amber-400 px-3 py-1.5 font-semibold text-zinc-950 hover:bg-amber-300"
              >
                Pegar Token Aquí
              </button>
            </div>
          </div>
        )}

        {/* Toast de Resultado */}
        {toast && (
          <div
            className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-xs ${
              toast.type === "success"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : "border-red-500/30 bg-red-500/10 text-red-200"
            }`}
          >
            <div className="flex items-start gap-3">
              {toast.type === "success" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              )}
              <div>
                <p className="font-semibold">{toast.title}</p>
                {toast.detail && <p className="mt-0.5 opacity-90">{toast.detail}</p>}
              </div>
            </div>
            {toast.repoUrl && (
              <a
                href={toast.repoUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-emerald-400/40 bg-emerald-400/15 px-3 py-1.5 font-medium text-emerald-200 hover:bg-emerald-400/25"
              >
                Abrir en GitHub →
              </a>
            )}
          </div>
        )}

        {/* Métricas Rápidas */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-zinc-800/80 bg-[#111114] p-4">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Apps Detectadas</span>
              <FolderSearch className="h-4 w-4 text-zinc-500" />
            </div>
            <p className="mt-2 text-2xl font-bold text-zinc-100">{metrics.total}</p>
          </div>
          <div className="rounded-xl border border-zinc-800/80 bg-[#111114] p-4">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Cambios Pendientes</span>
              <GitBranch className="h-4 w-4 text-orange-400" />
            </div>
            <p className="mt-2 text-2xl font-bold text-orange-400">{metrics.pending}</p>
          </div>
          <div className="rounded-xl border border-zinc-800/80 bg-[#111114] p-4">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Sin Subir a GitHub</span>
              <UploadCloud className="h-4 w-4 text-amber-400" />
            </div>
            <p className="mt-2 text-2xl font-bold text-amber-400">{metrics.untracked}</p>
          </div>
          <div className="rounded-xl border border-zinc-800/80 bg-[#111114] p-4">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Sincronizadas</span>
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
            </div>
            <p className="mt-2 text-2xl font-bold text-emerald-400">{metrics.synced}</p>
          </div>
        </section>

        {/* Barra de Filtros y Comando Rápido */}
        <section className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar app o stack..."
                className="w-60 rounded-lg border border-zinc-800 bg-[#111114] py-2 pl-8 pr-3 text-xs text-zinc-200 placeholder-zinc-500 focus:border-emerald-500/60 focus:outline-none"
              />
            </div>

            {(
              [
                { id: "all", label: "Todas" },
                { id: "pending", label: "Con Cambios" },
                { id: "untracked", label: "Sin Subir" },
                { id: "synced", label: "Al Día" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                  statusFilter === tab.id
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="hidden items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 font-mono text-[11px] text-zinc-400 md:flex">
            <Terminal className="h-3.5 w-3.5 text-emerald-400" />
            <span>CLI: gitpulse sync</span>
          </div>
        </section>

        {/* Grid de Aplicaciones */}
        {loading && !data ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-zinc-400">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
            Escaneando aplicaciones en tu workspace...
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 bg-[#111114]/60 py-14 text-center text-sm text-zinc-500">
            No se encontraron proyectos con los filtros actuales.
          </div>
        ) : (
          <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.localPath}
                project={project}
                isSyncing={Boolean(syncingPaths[project.localPath]) || syncingAll}
                onSync={handleSyncProject}
              />
            ))}
          </section>
        )}

        {/* Tabla de Historial */}
        {data && <SyncHistoryTable logs={data.logs} />}
      </main>

      {/* Modales */}
      {secretAlert && (
        <SecretAlertDialog
          projectName={secretAlert.projectName}
          projectPath={secretAlert.projectPath}
          findings={secretAlert.findings}
          onClose={() => setSecretAlert(null)}
          onForceSync={(projPath) => {
            setSecretAlert(null);
            handleSyncProject({ projectPath: projPath, forceIgnoreSecrets: true });
          }}
        />
      )}

      {showSettings && data && (
        <SettingsModal
          initialConfig={data.config}
          authStatus={data.authStatus}
          onClose={() => setShowSettings(false)}
          onSaved={loadWorkspace}
        />
      )}

      {showDoctor && <DoctorModal onClose={() => setShowDoctor(false)} />}
    </div>
  );
}
