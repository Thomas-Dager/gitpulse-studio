import { GoogleGenAI } from "@google/genai";
import { getAppConfig } from "@/lib/db";
import type { DetectedStack } from "@/types";

const CONVENTIONAL_PREFIX_RE =
  /^(feat|fix|chore|docs|refactor|style|test|build|ci|perf)(\([a-zA-Z0-9_.-]+\))?!?:\s+/;

export interface CommitMessageInput {
  isInitialCommit: boolean;
  stack: DetectedStack;
  changedFiles: string[];
  diffText: string;
  customMessage?: string;
}

function buildHeuristicCommitMessage(input: CommitMessageInput): string {
  const count = input.changedFiles.length;
  if (input.isInitialCommit) {
    const stackLabel = input.stack === "unknown" ? "base" : input.stack;
    return `feat: inicializa proyecto ${stackLabel} y estructura base (${count} archivos)`;
  }

  const normalized = input.changedFiles.map((f) => f.replace(/\\/g, "/").toLowerCase());
  const allDocs = normalized.every((f) => f.endsWith(".md") || f.includes("readme"));
  if (allDocs) {
    return `docs: actualiza documentación (${count} archivo${count === 1 ? "" : "s"})`;
  }

  const allConfig = normalized.every(
    (f) =>
      f.endsWith("package.json") ||
      f.endsWith(".gitignore") ||
      f.endsWith("tsconfig.json") ||
      f.endsWith(".yml") ||
      f.endsWith(".yaml") ||
      f.endsWith(".toml") ||
      f.endsWith(".env.example")
  );
  if (allConfig) {
    return `chore: actualiza configuración del proyecto (${count} archivo${count === 1 ? "" : "s"})`;
  }

  const hasApi = normalized.some((f) => f.includes("/api/") || f.includes("route.") || f.includes("server"));
  const hasUi = normalized.some(
    (f) =>
      f.includes("/components/") ||
      f.endsWith(".tsx") ||
      f.endsWith(".jsx") ||
      f.endsWith(".css") ||
      f.endsWith(".html")
  );

  if (hasApi && !hasUi) {
    return `feat(api): actualiza endpoints y lógica de servicios (${count} archivo${count === 1 ? "" : "s"})`;
  }
  if (hasUi && !hasApi) {
    return `feat(ui): actualiza componentes e interfaz visual (${count} archivo${count === 1 ? "" : "s"})`;
  }
  if (hasApi && hasUi) {
    return `feat: actualiza funcionalidades y vistas de la aplicación (${count} archivo${count === 1 ? "" : "s"})`;
  }

  return `chore: sincroniza cambios en el código (${count} archivo${count === 1 ? "" : "s"})`;
}

export async function generateSemanticCommitMessage(
  input: CommitMessageInput
): Promise<string> {
  const custom = input.customMessage?.trim();
  if (custom) {
    if (CONVENTIONAL_PREFIX_RE.test(custom)) {
      return custom;
    }
    return `feat: ${custom}`;
  }

  const cfg = getAppConfig();
  const geminiKey = process.env.GEMINI_API_KEY?.trim() || cfg.geminiApiKey?.trim();

  if (!cfg.autoGenerateCommit || !geminiKey) {
    return buildHeuristicCommitMessage(input);
  }

  try {
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const filePreview = input.changedFiles.slice(0, 40).join("\n");
    const truncatedDiff = input.diffText.slice(0, 6500);

    const prompt = [
      "Eres un experto en ingeniería de software. Genera UN ÚNICO mensaje de commit en formato Conventional Commits en español.",
      "Reglas estrictas:",
      "- Responde SOLO con la primera línea del commit (máximo 78 caracteres), sin comillas, sin markdown, sin explicaciones.",
      "- Prefijos válidos: feat, fix, chore, docs, refactor, style, test, build, perf.",
      "- Ejemplo: feat(auth): agrega inicio de sesión con Google y validación de tokens",
      `Stack detectado: ${input.stack}`,
      `Commit inicial: ${input.isInitialCommit ? "Sí" : "No"}`,
      `Archivos cambiados (${input.changedFiles.length}):\n${filePreview}`,
      `Resumen del diff:\n${truncatedDiff}`,
    ].join("\n\n");

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const raw = response.text?.trim().split(/\r?\n/)[0]?.replace(/^["'`]+|["'`]+$/g, "").trim();
    if (raw && CONVENTIONAL_PREFIX_RE.test(raw)) {
      return raw.slice(0, 100);
    }
    if (raw && raw.length >= 6) {
      return `feat: ${raw.slice(0, 90)}`;
    }
  } catch {
    // Fallback silencioso a heurística offline
  }

  return buildHeuristicCommitMessage(input);
}
