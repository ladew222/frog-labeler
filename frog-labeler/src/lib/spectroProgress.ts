import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";

export type FolderProgress = {
  total: number;
  done: number;
  started: boolean;
  finished: boolean;
  errors: number;
  processedFiles: Set<string>;
};

const DATA_DIR = path.resolve(process.cwd(), ".spectro-cache");
const CACHE_FILE = path.join(DATA_DIR, "progress.json");

let cache: Record<string, Omit<FolderProgress, "processedFiles"> & { processedFiles: string[] }> = {};

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

export function getProgress(folder: string) {
  return cache[folder] || {
    total: 0,
    done: 0,
    started: false,
    finished: false,
    errors: 0,
    processedFiles: [],
  };
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

loadCache();
