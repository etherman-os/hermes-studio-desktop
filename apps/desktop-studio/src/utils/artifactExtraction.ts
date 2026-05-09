import type { ArtifactCreateRequest, ArtifactType, StudioEvent } from "../api/studioClient";

export interface RunArtifactExtractionInput {
  runId: string;
  sessionId: string | null;
  prompt: string;
  events: StudioEvent[];
}

export interface ExtractedRunArtifactCandidate extends ArtifactCreateRequest {
  key: string;
  language: string;
}

const FENCE_RE = /```([^\n\r`]*)\r?\n([\s\S]*?)```/g;
const MAX_CANDIDATES = 8;
const MAX_CONTENT_CHARS = 180_000;

const MIME_BY_LANGUAGE: Record<string, string> = {
  html: "text/html",
  htm: "text/html",
  svg: "image/svg+xml",
  json: "application/json",
  md: "text/markdown",
  markdown: "text/markdown",
  css: "text/css",
  js: "text/javascript",
  jsx: "text/javascript",
  ts: "text/typescript",
  tsx: "text/typescript",
  txt: "text/plain",
  text: "text/plain",
  log: "text/plain",
};

const CODE_LANGUAGES = new Set(["js", "jsx", "ts", "tsx", "css", "py", "python", "rs", "go", "java", "cpp", "c", "sh", "bash", "zsh"]);

function normalizeLanguage(info: string) {
  const token = info.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return token.replace(/[^a-z0-9_+#.-]/g, "");
}

function safeTitlePart(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 90);
}

function fileNameFromInfo(info: string) {
  const tokens = info.trim().split(/\s+/).slice(1);
  const candidate = tokens.find((token) => /[./\\]/.test(token) && !token.startsWith("-"));
  if (!candidate) return null;
  return candidate.split(/[\\/]/).pop()?.replace(/[^\w. -]/g, "").trim() || null;
}

function fileNameFromContent(content: string) {
  const firstLines = content.split(/\r?\n/).slice(0, 5);
  for (const line of firstLines) {
    const match = line.match(/^\s*(?:\/\/|#|<!--)\s*(?:file|path):\s*([^>\n]+?)(?:\s*-->)?\s*$/i);
    if (match?.[1]) {
      return match[1].split(/[\\/]/).pop()?.replace(/[^\w. -]/g, "").trim() || null;
    }
  }
  return null;
}

function looksLikeHtml(content: string) {
  return /<!doctype\s+html|<html[\s>]|<body[\s>]|<main[\s>]|<section[\s>]|<div[\s>]|<svg[\s>]/i.test(content);
}

function looksLikeJson(content: string) {
  const trimmed = content.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function artifactTypeFor(language: string, content: string): ArtifactType {
  if (CODE_LANGUAGES.has(language)) return "text";
  if (language === "html" || language === "htm" || language === "svg" || looksLikeHtml(content)) return "html";
  if (language === "json" || looksLikeJson(content)) return "json";
  if (language === "md" || language === "markdown") return "markdown";
  if (language === "log") return "log_snapshot";
  return "text";
}

function mimeFor(language: string, type: ArtifactType) {
  if (MIME_BY_LANGUAGE[language]) return MIME_BY_LANGUAGE[language];
  if (type === "html") return "text/html";
  if (type === "json") return "application/json";
  if (type === "markdown") return "text/markdown";
  return "text/plain";
}

function textFromPayload(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function collectRunOutput(events: StudioEvent[]) {
  const fragments: string[] = [];
  for (const event of events) {
    if (event.type === "assistant.delta") {
      const text = textFromPayload(event.payload, ["text", "content", "delta"]);
      if (text) fragments.push(text);
      continue;
    }
    if (event.type === "run.completed") {
      const output = textFromPayload(event.payload, ["output", "result", "content", "text"]);
      if (output) fragments.push(`\n${output}\n`);
      continue;
    }
    if (event.type === "tool.completed") {
      const output = textFromPayload(event.payload, ["output", "result", "stdout", "content"]);
      if (output) fragments.push(`\n${output}\n`);
    }
  }
  return fragments.join("");
}

function contentHash(content: string) {
  let hash = 0;
  for (let i = 0; i < content.length; i += 1) {
    hash = ((hash << 5) - hash + content.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function candidateTitle(
  type: ArtifactType,
  language: string,
  run: RunArtifactExtractionInput,
  index: number,
  fileName: string | null,
) {
  if (fileName) return `Run output · ${safeTitlePart(fileName)}`;
  const prompt = safeTitlePart(run.prompt || run.runId);
  const label = type === "html" ? "HTML" : type === "json" ? "JSON" : type === "markdown" ? "Markdown" : language || "Text";
  return `Run output · ${label} ${index}${prompt ? ` · ${prompt}` : ""}`.slice(0, 180);
}

function makeCandidate(
  run: RunArtifactExtractionInput,
  content: string,
  rawInfo: string,
  index: number,
): ExtractedRunArtifactCandidate | null {
  const trimmed = content.trim();
  if (trimmed.length < 12) return null;
  const language = normalizeLanguage(rawInfo) || (looksLikeHtml(trimmed) ? "html" : looksLikeJson(trimmed) ? "json" : "text");
  const type = artifactTypeFor(language, trimmed);
  const fileName = fileNameFromInfo(rawInfo) ?? fileNameFromContent(trimmed);
  const bounded = trimmed.slice(0, MAX_CONTENT_CHARS);
  const key = `${type}:${language}:${contentHash(bounded)}`;
  return {
    key,
    language,
    title: candidateTitle(type, language, run, index, fileName),
    type,
    description: [
      `Extracted from Hermes run ${run.runId}.`,
      language ? `Language: ${language}.` : "",
      fileName ? `Detected file: ${fileName}.` : "",
      bounded.length < trimmed.length ? "Content was truncated to fit Studio artifact limits." : "",
    ].filter(Boolean).join(" "),
    content_text: bounded,
    mime_type: mimeFor(language, type),
    run_id: run.runId,
    session_id: run.sessionId,
    source: "run_output",
  };
}

export function extractRunArtifactCandidates(run: RunArtifactExtractionInput): ExtractedRunArtifactCandidate[] {
  const output = collectRunOutput(run.events);
  const candidates: ExtractedRunArtifactCandidate[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  let index = 1;

  while ((match = FENCE_RE.exec(output)) !== null) {
    const candidate = makeCandidate(run, match[2] ?? "", match[1] ?? "", index);
    if (candidate && !seen.has(candidate.key)) {
      seen.add(candidate.key);
      candidates.push(candidate);
      index += 1;
    }
    if (candidates.length >= MAX_CANDIDATES) return candidates;
  }

  if (candidates.length === 0) {
    const wholeOutput = output.trim();
    if (looksLikeHtml(wholeOutput) || looksLikeJson(wholeOutput)) {
      const candidate = makeCandidate(run, wholeOutput, "", 1);
      if (candidate) candidates.push(candidate);
    }
  }

  return candidates;
}
