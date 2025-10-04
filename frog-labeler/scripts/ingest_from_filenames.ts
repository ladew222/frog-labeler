// usage:
// pnpm tsx scripts/ingest_from_filenames.ts --project demo [--reset]

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// ---------- CLI ----------
const args = new Set(process.argv.slice(2));
function getArg(name: string, def: string) {
  const i = process.argv.findIndex((a) => a === `--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const PROJECT_ID = getArg("project", "demo");
const DO_RESET = args.has("--reset");

// ---------- filename parsing ----------
// Pattern A (canonical): SITE[-UNIT]_YYYYMMDD_HHMMSS[_SEQ].wav   e.g. SLBE-11_20150727_230000.wav
const RE_CANON = /^([A-Za-z0-9-]+?)(?:-([A-Za-z0-9-]+))?_(\d{8})_(\d{6})(?:_(\d{1,}))?$/i;
// Pattern B (GLKN style, no hyphen): SITE+UNIT_YYYYMMDD_HHMMSS[_SEQ].wav   e.g. SLBE11_20150727_230000.wav
const RE_GLKN = /^([A-Za-z]+?)(\d+)?_(\d{8})_(\d{6})(?:_(\d{1,}))?$/i;

type Parsed = {
  site: string;
  unitId: string | null;
  recordedAt: Date; // UTC
  seq?: number | null;
  ext: string;
};

function parseName(name: string): Parsed {
  const base = path.basename(name);
  const dot = base.lastIndexOf(".");
  const stem = dot >= 0 ? base.slice(0, dot) : base;
  const ext = dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
  if (ext !== "wav") throw new Error(`Not a .wav: ${name}`);

  let m = stem.match(RE_CANON);
  if (!m) m = stem.match(RE_GLKN);
  if (!m) {
    throw new Error(
      `Bad filename (expect SITE[-UNIT]|SITEUNIT _ YYYYMMDD _ HHMMSS [_SEQ].wav): ${base}`
    );
  }

  // Both regexes align as:
  // [1]=site or site letters, [2]=unit or digits (optional), [3]=YYYYMMDD, [4]=HHMMSS, [5]=SEQ?
  const [, siteRaw, unitRaw, ymd, hms, seqStr] = m;

  // If siteRaw has digits (GLKN), split trailing digits into unit when RE_GLKN didn’t capture it.
  let site = siteRaw;
  let unit = unitRaw ?? null;
  if (!unit && /[A-Za-z]+\d+$/.test(siteRaw)) {
    const n = siteRaw.match(/^([A-Za-z]+)(\d+)$/);
    if (n) { site = n[1]; unit = n[2]; }
  }

  const y = Number(ymd.slice(0, 4));
  const mo = Number(ymd.slice(4, 6));
  const d = Number(ymd.slice(6, 8));
  const H = Number(hms.slice(0, 2));
  const M = Number(hms.slice(2, 4));
  const S = Number(hms.slice(4, 6));
  const recordedAt = new Date(Date.UTC(y, mo - 1, d, H, M, S));

  return {
    site,
    unitId: unit ?? null,
    recordedAt,
    seq: seqStr ? Number(seqStr) : null,
    ext,
  };
}

// ---------- FS helpers ----------
function* walk(dir: string): Generator<string> {
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop()!;
    const list = fs.readdirSync(cur, { withFileTypes: true });
    for (const e of list) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else yield full;
    }
  }
}

function toWebPath(absPathUnderPublic: string) {
  // Convert absolute .../public/... to web path /...
  const i = absPathUnderPublic.lastIndexOf(`${path.sep}public${path.sep}`);
  const rel = i >= 0 ? absPathUnderPublic.slice(i + 7) : absPathUnderPublic; // 7 = "/public".length
  // Use encodeURI to keep slashes but escape spaces etc.
  return encodeURI(rel.startsWith("/") ? rel : `/${rel}`);
}

// ---------- main ----------
async function main() {
  const audioRoot = path.join(process.cwd(), "public", "audio");
  if (!fs.existsSync(audioRoot)) {
    console.error(`No folder: ${audioRoot}`);
    process.exit(1);
  }

  // Ensure project exists
  const project = await db.project.upsert({
    where: { id: PROJECT_ID },
    update: {},
    create: { id: PROJECT_ID, name: `${PROJECT_ID} Project` },
  });

  if (DO_RESET) {
    // If you have existing segments, either cascade or delete them first.
    // This only clears rows for THIS project.
    const del = await db.audioFile.deleteMany({ where: { projectId: project.id } });
    console.log(`Reset: deleted ${del.count} audio rows for project "${PROJECT_ID}".`);
  }

  // Seed a few default labels (safe idempotent)
  for (const l of [
    { name: "frog", color: "#22c55e", hotkey: "1" },
    { name: "not-frog", color: "#ef4444", hotkey: "2" },
    { name: "species", color: "#3b82f6", hotkey: "3" },
  ]) {
    await db.label.upsert({
      where: { projectId_name: { projectId: project.id, name: l.name } },
      update: l,
      create: { projectId: project.id, ...l },
    });
  }

  let scanned = 0, created = 0, updated = 0;
  const bad: string[] = [];

  for (const full of walk(audioRoot)) {
    if (!/\.wav$/i.test(full)) continue;
    scanned++;

    const base = path.basename(full);
    let meta: Parsed | null = null;
    try { meta = parseName(base); }
    catch { bad.push(base); continue; }

    const webUri = toWebPath(full); // e.g. /audio/GLKN/SLBE/2015/SLBE11_20150727_230000.wav

    const row = {
      projectId: project.id,
      originalName: base,          // keep original filename
      uri: webUri,                 // served statically by Next
      recordedAt: meta.recordedAt,
      site: meta.site,
      unitId: meta.unitId,
      extension: meta.ext,         // optional column in schema
      sequence: meta.seq,          // optional column in schema
    };

    // Upsert BY (projectId, originalName) — safer if you have multiple projects
    await db.audioFile
      .upsert({
        where: { projectId_originalName: { projectId: row.projectId, originalName: row.originalName } },
        update: {
          uri: row.uri,
          recordedAt: row.recordedAt,
          site: row.site,
          unitId: row.unitId,
          extension: row.extension as any,
          sequence: row.sequence as any,
        },
        create: row,
      })
      .then((res) => {
        // heuristic to count created vs updated
        if ((res as any).createdAt && Math.abs(Date.now() - (res as any).createdAt.getTime?.() ?? Date.now()) < 2000) {
          created++;
        } else {
          updated++;
        }
      })
      .catch((e) => {
        console.error(`Failed upsert for ${base}:`, e);
        bad.push(base);
      });
  }

  console.log(`Scanned ${scanned}. Created ${created}. Updated ${updated}.`);
  if (bad.length) {
    console.log(`Unparsed/failed (${bad.length}):`);
    for (const b of bad) console.log("  -", b);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
