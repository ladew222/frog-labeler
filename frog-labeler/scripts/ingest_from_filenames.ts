// scripts/ingest_from_filenames.ts
// usage:
// pnpm tsx scripts/ingest_from_filenames.ts --project demo [--include dir1,dir2] [--reset] [--dry-run] [--root /path]

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

import "dotenv/config";
import dotenv from "dotenv";
const envLocal = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envLocal)) dotenv.config({ path: envLocal, override: true });

const db = new PrismaClient();

/* ----------------------------- CLI helpers ----------------------------- */

function getFlag(name: string) {
  return process.argv.includes(`--${name}`);
}
function getOpt(name: string, def?: string) {
  const i = process.argv.findIndex((a) => a === `--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const PROJECT_ID = getOpt("project", "demo")!;
const INCLUDE_RAW = getOpt("include", "") || "";
const INCLUDE = INCLUDE_RAW
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const DO_RESET = getFlag("reset");
const DRY_RUN = getFlag("dry-run");
const ROOT =
  getOpt("root") ||
  process.env.AUDIO_ROOT ||
  path.join(process.cwd(), "public", "audio");

/* ------------------------------ parsing ------------------------------- */

// A: SITE[-UNIT]_YYYYMMDD_HHMMSS[_SEQ].wav
const RE_CANON = /^([A-Za-z0-9-]+?)(?:-([A-Za-z0-9-]+))?_(\d{8})_(\d{6})(?:_(\d{1,}))?$/i;
// B: SITE+UNIT_YYYYMMDD_HHMMSS[_SEQ].wav (GLKN)
const RE_GLKN = /^([A-Za-z]+?)(\d+)?_(\d{8})_(\d{6})(?:_(\d{1,}))?$/i;

type Parsed = {
  site: string;
  unitId: string | null;
  recordedAt: Date; // UTC
  seq?: number | null;
  ext: string;
};

function parseName(filename: string): Parsed {
  const base = path.basename(filename);
  const dot = base.lastIndexOf(".");
  const stem = dot >= 0 ? base.slice(0, dot) : base;
  const ext = dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
  if (ext !== "wav") throw new Error(`Not a .wav: ${filename}`);

  const parts = stem.split("_");
  if (parts.length < 3) throw new Error(`Bad filename (too few parts): ${base}`);

  // Optional trailing sequence like ..._003
  let seq: number | null = null;
  const p = [...parts];
  if (/^\d+$/.test(p[p.length - 1]) && p[p.length - 1].length <= 3) {
    seq = Number(p.pop());
  }
  if (p.length < 3) throw new Error(`Bad filename (missing date/time): ${base}`);

  const ymd = p[p.length - 2];
  const hms = p[p.length - 1];
  if (!/^\d{8}$/.test(ymd) || !/^\d{6}$/.test(hms)) {
    throw new Error(`Bad filename (date/time): ${base}`);
  }

  // IDs before date/time
  const idParts = p.slice(0, -2);
  const token0 = idParts[0];
  if (!token0) throw new Error(`Bad filename (missing ID): ${base}`);

  // token0 may be SITE with trailing digits, e.g., APIS01 → site=APIS, unit=01
  const m = token0.match(/^([A-Za-z]+)(\d+)?$/);
  let site = token0;
  let unitId: string | null = null;
  if (m) {
    site = m[1];
    if (m[2]) unitId = m[2];
  }

  // token1 (if present) overrides unitId and may include '+', '-', digits, etc. (e.g., "0+1")
  if (idParts.length >= 2) {
    unitId = idParts[1];
  }

  const y = Number(ymd.slice(0, 4));
  const mo = Number(ymd.slice(4, 6));
  const d = Number(ymd.slice(6, 8));
  const H = Number(hms.slice(0, 2));
  const M = Number(hms.slice(2, 4));
  const S = Number(hms.slice(4, 6));

  return {
    site,
    unitId: unitId ?? null,
    recordedAt: new Date(Date.UTC(y, mo - 1, d, H, M, S)),
    seq,
    ext,
  };
}

/* --------------------------- filesystem utils -------------------------- */

function* walk(dir: string): Generator<string> {
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop()!;
    let list: fs.Dirent[];
    try {
      list = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of list) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else yield full;
    }
  }
}

function relUnix(root: string, full: string): string {
  return path.relative(root, full).split(path.sep).join("/");
}

/** Build the `/audio/...` URI used by your streaming route */
function toAudioUri(relUnixPath: string): string {
  const encoded = relUnixPath.split("/").map(encodeURIComponent).join("/");
  return `/audio/${encoded}`;
}

/* ------------------------------- main ---------------------------------- */

async function ensureProject(projectId: string) {
  return db.project.upsert({
    where: { id: projectId },
    update: {},
    create: { id: projectId, name: `${projectId} Project` },
  });
}

async function seedDefaultLabels(projectId: string) {
  const defaults = [
    { name: "frog", color: "#22c55e", hotkey: "1" },
    { name: "not-frog", color: "#ef4444", hotkey: "2" },
    { name: "species", color: "#3b82f6", hotkey: "3" },
  ];
  for (const l of defaults) {
    if (DRY_RUN) continue;
    await db.label.upsert({
      where: { projectId_name: { projectId, name: l.name } },
      update: l,
      create: { projectId, ...l },
    });
  }
}

/** Delete previous ingests. If includeDirs given, only rows whose uri starts with those prefixes will be deleted. */
async function resetPrevious(projectId: string, includeDirs: string[]) {
  if (DRY_RUN) {
    if (includeDirs.length) {
      console.log(
        `DRY-RUN reset: would delete audio rows for project "${projectId}" where uri starts with:`,
        includeDirs.map((d) => `/audio/${encodeURIComponent(d)}/...`).join(", "),
      );
    } else {
      console.log(`DRY-RUN reset: would delete ALL audio rows for project "${projectId}".`);
    }
    return;
  }

  if (includeDirs.length === 0) {
    const del = await db.audioFile.deleteMany({ where: { projectId } });
    console.log(`Reset: deleted ${del.count} audio rows for project "${projectId}".`);
    return;
  }

  // Delete in batches per prefix to leverage DB index/like
  let total = 0;
  for (const dir of includeDirs) {
    // prefix like "/audio/INDU08_GreatMarsh/%"
    const prefix = `/audio/${encodeURIComponent(dir)}/`;
    const del = await db.audioFile.deleteMany({
      where: {
        projectId,
        uri: { startsWith: prefix },
      },
    });
    total += del.count;
    console.log(`Reset: deleted ${del.count} rows under ${dir}`);
  }
  console.log(`Reset complete: ${total} rows removed.`);
}

function shouldInclude(relUnixPath: string, includeDirs: string[]) {
  if (includeDirs.length === 0) return true;
  // match first segment against include list
  const first = relUnixPath.split("/")[0] || "";
  return includeDirs.includes(first);
}

async function main() {
  // Validate root
  if (!fs.existsSync(ROOT) || !fs.statSync(ROOT).isDirectory()) {
    console.error(`Root not found or not a directory: ${ROOT}`);
    process.exit(1);
  }
  console.log(
    `Ingest root: ${ROOT}\nProject: ${PROJECT_ID}\nInclude: ${INCLUDE.length ? INCLUDE.join(", ") : "(all)"}\nReset: ${
      DO_RESET ? "yes" : "no"
    }\nDry-run: ${DRY_RUN ? "yes" : "no"}\n`,
  );

  const project = await ensureProject(PROJECT_ID);

  if (DO_RESET) {
    await resetPrevious(project.id, INCLUDE);
  }

  await seedDefaultLabels(project.id);

  let scanned = 0,
    created = 0,
    updated = 0;
  const bad: string[] = [];

  for (const full of walk(ROOT)) {
    if (!/\.wav$/i.test(full)) continue;

    const rel = relUnix(ROOT, full); // e.g., "INDU08_GreatMarsh/2015/file.wav"
    if (!shouldInclude(rel, INCLUDE)) continue;

    scanned++;

    const base = path.basename(full);
    let meta: Parsed | null = null;
    try {
      meta = parseName(base);
    } catch (e) {
      bad.push(base);
      continue;
    }

    const uri = toAudioUri(rel); // `/audio/<encoded segments>`
    const row = {
      projectId: project.id,
      originalName: base,
      uri,
      recordedAt: meta.recordedAt,
      site: meta.site,
      unitId: meta.unitId,
      extension: meta.ext as any,
      sequence: (meta.seq ?? null) as any,
    };

    // Use your composite unique; if you also have/plan a unique on (projectId, uri), that’s even better.
    const key = { projectId: row.projectId, originalName: row.originalName };
    const existing = await db.audioFile.findUnique({
      where: { projectId_originalName: key },
    });

    if (existing) {
      if (!DRY_RUN) {
        await db.audioFile.update({
          where: { projectId_originalName: key },
          data: {
            uri: row.uri,
            recordedAt: row.recordedAt,
            site: row.site,
            unitId: row.unitId,
            extension: row.extension,
            sequence: row.sequence,
          },
        });
      }
      updated++;
    } else {
      if (!DRY_RUN) {
        await db.audioFile.create({ data: row as any });
      }
      created++;
    }
  }

  console.log(`Scanned ${scanned}. Created ${created}. Updated ${updated}.`);
  if (bad.length) {
    console.log(`Unparsed/failed (${bad.length}):`);
    bad.forEach((b) => console.log("  -", b));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
