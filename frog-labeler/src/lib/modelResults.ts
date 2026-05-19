import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_MODEL_RESULTS_ROOT =
  process.env.MODEL_RESULTS_ROOT?.trim() ||
  "/Users/egweinberg/Documents/frgAI/runs/scan_viz_labeled";

export function getModelResultsRoot(): string {
  return DEFAULT_MODEL_RESULTS_ROOT;
}

export function stemFromAudioUri(uri: string): string | null {
  if (!uri) return null;
  const last = uri.split("/").pop();
  if (!last) return null;
  const decoded = decodeURIComponent(last);
  return decoded.replace(/\.wav$/i, "");
}

export function modelResultDirForUri(uri: string): string | null {
  const stem = stemFromAudioUri(uri);
  if (!stem) return null;
  return path.join(getModelResultsRoot(), stem);
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function loadModelReportForUri(uri: string) {
  const dir = modelResultDirForUri(uri);
  if (!dir) return null;
  const reportPath = path.join(dir, "report.json");
  if (!(await pathExists(reportPath))) return null;
  const raw = await fs.readFile(reportPath, "utf8");
  return JSON.parse(raw);
}

export async function listModelAssetsForUri(uri: string) {
  const dir = modelResultDirForUri(uri);
  if (!dir) return [];
  if (!(await pathExists(dir))) return [];
  return fs.readdir(dir);
}

export function contentTypeForAsset(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".html")) return "text/html; charset=utf-8";
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  return "application/octet-stream";
}
