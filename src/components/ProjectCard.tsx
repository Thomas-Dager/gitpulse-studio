"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FolderGit2,
  GitBranch,
  GitCommitHorizontal,
  Loader2,
  RefreshCw,
  Tag,
  UploadCloud,
} from "lucide-react";
import type { ProjectGitStatus, SyncResult } from "@/types";

interface ProjectCardProps {
  project: ProjectGitStatus;
  isSyncing: boolean;
  onSync: (params: {
    projectPath: string;
    customMessage?: string;
    branch?: string;
    tag?: string;
  }) => Promise<SyncResult | void>;
}

const STACK_STYLES: Record<string, { label: string; classes: string }> = {
  nextjs: {
    label: "Next.js",
    classes: "border-zinc-700 bg-zinc-800/80 text-zinc-200",
  },
  node: {
    label: "Node.js",
    classes: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  },
  python: {
    label: "Python",
    classes: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  },
  flutter: {
    label: "Flutter",
    classes: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
  },
  rust: {
    label: "Rust",
    classes: "border-orange-500/30 bg-orange-500/10 text-orange-300",
  },
  static: {
    label: "Web Estática",
    classes: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  },
  unknown: {
    label: "Proyecto",
    classes: "border-zinc-700 bg-zinc-900 text-zinc-400",
  },
};

export function ProjectCard({ project, isSyncing, onSync }: ProjectCardProps) {
  const [customMessage, setCustomMessage] = useState("");
  const [branch, setBranch] = useState(project.currentBranch || "main");
  const [tag, setTag] = useState("");
  const [showFiles, setShowFiles] = useState(false);

  const stackStyle = STACK_STYLES[project.detectedStack] || STACK_STYLES.unknown;

  const statusBadge = (() => {
    switch (project.status) {
      case "untracked":
        return {
          dot: "bg-amber-400",
          text: project.isGitInitialized ? "Sin remoto GitHub" : "Sin subir a GitHub",
          pill: "border-amber-500/30 bg-amber-500/10 text-amber-300",
        };
      case "dirty":
        return {
          dot: "bg-orange-400",
          text: `${project.totalChanges} cambio${project.totalChanges === 1 ? "" : "s"} pendiente${project.totalChanges === 1 ? "" : "s"}`,
          pill: "border-orange-500/30 bg-orange-500/10 text-orange-300",
        };
      case "ahead":
        return {
          dot: "bg-sky-400",
          text: `${project.aheadCount} commit${project.aheadCount === 1 ? "" : "s"} por subir`,
          pill: "border-sky-500/30 bg-sky-500/10 text-sky-300",
        };
      default:
        return {
          dot: "bg-emerald-400",
          text: "Sincronizado",
          pill: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
        };
    }
  })();

  const allPreviewFiles = [
    ...project.modifiedFiles.map((f) => ({ label: "M", path: f })),
    ...project.stagedFiles.map((f) => ({ label: "S", path: f })),
    ...project.untrackedFiles.map((f) => ({ label: "N", path: f })),
  ];

  const handleSubmit = async () => {
    const res = await onSync({
      projectPath: project.localPath,
      customMessage: customMessage.trim() || undefined,
      branch: branch.trim() || "main",
      tag: tag.trim() || undefined,
    });
    if (res?.success) {
      setCustomMessage("");
      setTag("");
    }
  };

  return (
    <div className="flex flex-col justify-between rounded-xl border border-zinc-800/90 bg-[#111114] p-5 transition-colors hover:border-zinc-700">
      <div>
        {/* Cabecera */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <FolderGit2 className="h-4 w-4 shrink-0 text-emerald-400" />
              <h3 className="truncate text-base font-semibold text-zinc-100">
                {project.name}
              </h3>
            </div>
            <p className="mt-1 truncate font-mono text-xs text-zinc-500" title={project.localPath}>
              {project.localPath}
            </p>
          </div>

          <span
            className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-medium ${stackStyle.classes}`}
          >
            {stackStyle.label}
          </span>
        </div>

        {/* Estado y Enlace GitHub */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadge.pill}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${statusBadge.dot}`} />
            {statusBadge.text}
          </span>

          {project.githubHtmlUrl ? (
            <a
              href={project.githubHtmlUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-zinc-400 transition-colors hover:text-emerald-400"
            >
              Ver en GitHub
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <span className="text-[11px] text-zinc-500">
              Repo futuro: <code className="text-zinc-300">{project.sanitizedRepoName}</code> (público)
            </span>
          )}
        </div>

        {/* Último Commit & Tag */}
        <div className="mt-3 rounded-lg border border-zinc-800/70 bg-zinc-950/60 p-3 text-xs">
          {project.latestCommitHash ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-zinc-400">
                <span className="inline-flex items-center gap-1 font-mono text-emerald-400">
                  <GitCommitHorizontal className="h-3.5 w-3.5" />
                  {project.latestCommitHash}
                </span>
                <div className="flex items-center gap-2">
                  {project.latestTag && (
                    <span className="inline-flex items-center gap-1 rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
                      <Tag className="h-2.5 w-2.5" />
                      {project.latestTag}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 font-mono text-[11px] text-zinc-400">
                    <GitBranch className="h-3 w-3" />
                    {project.currentBranch}
                  </span>
                </div>
              </div>
              <p className="truncate text-zinc-300" title={project.latestCommitMessage || ""}>
                {project.latestCommitMessage}
              </p>
            </div>
          ) : (
            <p className="text-zinc-500">
              Aún sin commits locales. Se inicializará en rama{" "}
              <code className="text-zinc-300">main</code> con <code className="text-zinc-300">.gitignore</code> automático.
            </p>
          )}
        </div>

        {/* Lista desplegable de archivos modificados */}
        {allPreviewFiles.length > 0 && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowFiles((prev) => !prev)}
              className="flex w-full items-center justify-between rounded-md border border-zinc-800/70 bg-zinc-900/50 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900"
            >
              <span>Archivos detectados ({allPreviewFiles.length})</span>
              {showFiles ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {showFiles && (
              <div className="mt-1.5 max-h-32 overflow-y-auto rounded-md border border-zinc-800 bg-zinc-950 p-2 font-mono text-[11px]">
                {allPreviewFiles.slice(0, 60).map((item, idx) => (
                  <div key={`${item.path}-${idx}`} className="flex items-center gap-2 py-0.5 text-zinc-400">
                    <span
                      className={`w-4 shrink-0 font-bold ${
                        item.label === "N"
                          ? "text-emerald-400"
                          : item.label === "M"
                          ? "text-amber-400"
                          : "text-sky-400"
                      }`}
                    >
                      {item.label}
                    </span>
                    <span className="truncate">{item.path}</span>
                  </div>
                ))}
                {allPreviewFiles.length > 60 && (
                  <div className="pt-1 text-zinc-500">
                    ... y {allPreviewFiles.length - 60} archivos más.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Controles de Sync */}
      <div className="mt-4 space-y-2 border-t border-zinc-800/70 pt-3">
        <input
          type="text"
          value={customMessage}
          onChange={(e) => setCustomMessage(e.target.value)}
          placeholder="Nota de commit (opcional; vacío = automático)"
          className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:border-emerald-500/60 focus:outline-none"
        />
        <div className="grid grid-cols-2 gap-2">
          <div className="relative">
            <GitBranch className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-500" />
            <input
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="Rama (main)"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 py-1.5 pl-8 pr-2 text-xs text-zinc-200 placeholder-zinc-500 focus:border-emerald-500/60 focus:outline-none"
            />
          </div>
          <div className="relative">
            <Tag className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-500" />
            <input
              type="text"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="Tag (ej. v1.0.0)"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 py-1.5 pl-8 pr-2 text-xs text-zinc-200 placeholder-zinc-500 focus:border-emerald-500/60 focus:outline-none"
            />
          </div>
        </div>

        <button
          type="button"
          disabled={isSyncing}
          onClick={handleSubmit}
          className={`flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
            project.status === "synced" && !tag.trim()
              ? "border border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
              : "bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
          }`}
        >
          {isSyncing ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Sincronizando con GitHub...
            </>
          ) : project.status === "untracked" ? (
            <>
              <UploadCloud className="h-3.5 w-3.5" />
              Publicar en GitHub (Público)
            </>
          ) : project.status === "dirty" || project.status === "ahead" ? (
            <>
              <RefreshCw className="h-3.5 w-3.5" />
              Actualizar en GitHub
            </>
          ) : (
            <>
              <RefreshCw className="h-3.5 w-3.5" />
              Verificar / Subir Tag
            </>
          )}
        </button>
      </div>
    </div>
  );
}
