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

// In-memory progress cache (mirrors progress.json)
let cache: Record<string, FolderProgress> = {};

// --- helpers ---------------------------------------------------------------

function loadCache() {
  try {
    if (existsSync(CACHE_FILE)) {
      cache = JSON.parse(readFileSync(CACHE_FILE, "utf8"));
      console.log(`📁 Loaded progress cache from ${CACHE_FILE}`);
    }
  } catch (err) {
    console.warn("⚠️ Failed to load progress cache:", err);
    cache = {};
  }
}

function saveCache() {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (err) {
    console.error("⚠️ Failed to save progress cache:", err);
  }
}

// --- core functions --------------------------------------------------------

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

/**
 * ✅ Update progress safely for any field (done, errors, finished, etc.)
 * This is what your batch process calls repeatedly.
 */
export function updateProgress(
  folder: string,
  update: Partial<FolderProgress>
) {
  const p = getProgress(folder);
  Object.assign(p, update);
  cache[folder] = p;
  saveCache();
}

export function finishFolder(folder: string) {
  const p = getProgress(folder);
  p.finished = true;
  cache[folder] = p;
  saveCache();
}

export function markFileDone(folder: string, filePath: string) {
  const p = getProgress(folder);
  if (!p.processedFiles.includes(filePath)) {
    p.processedFiles.push(filePath);
    p.done += 1;
    cache[folder] = p;
    saveCache();
  }
}

export function allProgress() {
  return cache;
}

/** Optionally reset all progress (used for testing/debug) */
export function clearProgress() {
  cache = {};
  saveCache();
  console.log("🧹 Cleared spectrogram progress cache");
}

// Load cache immediately when this module is imported
loadCache();
