import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";

export type FolderProgress = {
  total: number;
  done: number;
  started: boolean;
  finished: boolean;
  errors: number;
  processedFiles: string[];
};

const DATA_DIR = path.resolve(process.cwd(), ".spectro-cache");
const CACHE_FILE = path.join(DATA_DIR, "progress.json");

let cache: Record<string, FolderProgress> = {};

// --- load/save helpers ----------------------------------------------------
export function loadCache() {
  try {
    if (existsSync(CACHE_FILE)) {
      cache = JSON.parse(readFileSync(CACHE_FILE, "utf8"));
    } else {
      mkdirSync(DATA_DIR, { recursive: true });
      cache = {};
    }
  } catch {
    cache = {};
  }
}

export function saveCache() {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

// --- public API ------------------------------------------------------------
export function getProgress(folder: string): FolderProgress {
  if (!cache[folder]) {
    cache[folder] = {
      total: 0,
      done: 0,
      started: false,
      finished: false,
      errors: 0,
      processedFiles: [],
    };
  }
  return cache[folder];
}

export function updateProgress(
  folder: string,
  update: Partial<FolderProgress>
) {
  const prev = getProgress(folder);
  const next = { ...prev, ...update };
  cache[folder] = next;
  saveCache();
}

export function markFileDone(folder: string, file: string) {
  const p = getProgress(folder);
  if (!p.processedFiles.includes(file)) {
    p.done += 1;
    p.processedFiles.push(file);
    updateProgress(folder, p);
  }
}

export function initFolder(folder: string, total: number) {
  cache[folder] = {
    total,
    done: 0,
    started: true,
    finished: false,
    errors: 0,
    processedFiles: [],
  };
  saveCache();
}

export function finishFolder(folder: string) {
  const p = getProgress(folder);
  p.finished = true;
  updateProgress(folder, p);
}

export function allProgress() {
  return cache;
}

export function clearProgress() {
  cache = {};
  saveCache();
}

// load once at startup
loadCache();
