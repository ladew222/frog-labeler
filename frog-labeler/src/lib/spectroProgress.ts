import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "fs";
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

// --- Load / Save helpers ---------------------------------------------------

function loadCache() {
  try {
    if (existsSync(CACHE_FILE)) {
      cache = JSON.parse(readFileSync(CACHE_FILE, "utf8"));
      console.log(`📁 Loaded progress cache from ${CACHE_FILE}`);
    }
  } catch {
    cache = {};
  }
}

function saveCache() {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

// Load cache immediately on module import
loadCache();

// --- API functions ---------------------------------------------------------

export function getProgress(folder: string) {
  return (
    cache[folder] || {
      total: 0,
      done: 0,
      started: false,
      finished: false,
      errors: 0,
      processedFiles: [],
    }
  );
}

export function markFileDone(folder: string, filePath: string) {
  const p = getProgress(folder);
  if (!p.processedFiles.includes(filePath)) {
    p.done += 1;
    p.processedFiles.push(filePath);
    cache[folder] = p;
    saveCache();
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
  cache[folder] = p;
  saveCache();
}

export function allProgress() {
  return cache;
}

// Optional utility to clear the cache completely
export function clearProgress() {
  try {
    if (existsSync(CACHE_FILE)) {
      unlinkSync(CACHE_FILE);
      console.log("🧹 Cleared spectrogram progress cache");
    }
    cache = {};
  } catch (err) {
    console.error("❌ Failed to clear cache:", err);
  }
}
