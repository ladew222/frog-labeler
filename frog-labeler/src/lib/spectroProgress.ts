import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";

export type FolderProgress = {
  total: number;
  done: number;
  started: boolean;
  finished: boolean;
  errors: number;
};

// --- where progress is stored on disk ---
const DATA_DIR = path.resolve(process.cwd(), ".spectro-cache");
const CACHE_FILE = path.join(DATA_DIR, "progress.json");

// --- in-memory cache (auto loaded/saved) ---
let cache: Record<string, FolderProgress> = {};

// --- load from disk at startup ---
function loadCache() {
  try {
    if (existsSync(CACHE_FILE)) {
      const raw = readFileSync(CACHE_FILE, "utf8");
      cache = JSON.parse(raw);
      console.log(`📁 Loaded progress cache from ${CACHE_FILE}`);
    }
  } catch (err) {
    console.warn("⚠️ Failed to load progress cache:", err);
    cache = {};
  }
}

// --- save to disk ---
function saveCache() {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (err) {
    console.warn("⚠️ Failed to save progress cache:", err);
  }
}

// --- public API ------------------------------------------------------------

// update a folder’s progress
export function updateProgress(folder: string, partial: Partial<FolderProgress>) {
  const current = cache[folder] || {
    total: 0,
    done: 0,
    started: false,
    finished: false,
    errors: 0,
  };
  cache[folder] = { ...current, ...partial };
  saveCache();
}

// return all progress data
export function allProgress(): Record<string, FolderProgress> {
  return cache;
}

// reset or clear (optional)
export function clearProgress() {
  cache = {};
  saveCache();
}

// load once at startup
loadCache();
