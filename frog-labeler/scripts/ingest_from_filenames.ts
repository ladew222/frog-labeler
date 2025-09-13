// pnpm ts-node scripts/ingest_from_filenames.ts
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

// Accept canonical with optional suffix, e.g. SC4-2339_20180404_190000[_1].wav
// and “human date” with optional suffix, e.g. SC4-2339_Wed Apr 4 19:00:00 UTC 2018[_1].wav
function parse(name: string) {
  const base = name.replace(/^.*\//, "");
  const dot = base.lastIndexOf(".");
  const stem = dot >= 0 ? base.slice(0, dot) : base;
  const ext = dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";

  const us = stem.indexOf("_");
  if (us < 0) return null;

  const siteUnit = stem.slice(0, us);
  let rest = stem.slice(us + 1);

  const [site, unitId = ""] = siteUnit.includes("-")
    ? siteUnit.split("-")
    : [siteUnit, ""];

  // strip a trailing _suffix like "_1" / "_copy" / "_final"
  rest = rest.replace(/_[A-Za-z0-9-]+$/, "");

  // 1) canonical:  YYYYMMDD_HHMMSS
  const m = rest.match(/^(\d{8})_(\d{6})$/);
  if (m) {
    const [_, ymd, hms] = m;
    const iso = `${ymd.slice(0,4)}-${ymd.slice(4,6)}-${ymd.slice(6,8)}T${hms.slice(0,2)}:${hms.slice(2,4)}:${hms.slice(4,6)}Z`;
    return { site, unitId, recordedAt: new Date(iso), ext };
  }

  // 2) human-readable date (allow multiple spaces/underscores)
  const restNorm = rest.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  const d = new Date(restNorm); // e.g., "Wed Apr 4 19:00:00 UTC 2018"
  if (!Number.isNaN(d.getTime())) {
    return { site, unitId, recordedAt: d, ext };
  }

  return null;
}

async function main() {
  const audioDir = path.join(process.cwd(), "public", "audio");
  const files = fs.readdirSync(audioDir).filter(f => f.toLowerCase().endsWith(".wav"));

  const project = await db.project.upsert({
    where: { id: "demo" },
    update: {},
    create: { id: "demo", name: "Demo Project" },
  });

  // Ensure default labels
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

  const rows = files.map(fn => {
    const p = parse(fn);
    if (!p) throw new Error(`Bad filename: ${fn}`);
    return {
      projectId: project.id,
      originalName: fn,                         // @unique in schema
      uri: `/audio/${encodeURIComponent(fn)}`,  // encode spaces/suffixes
      recordedAt: p.recordedAt,
      site: p.site,
      unitId: p.unitId,
      extension: p.ext,
    };
  });

  // Idempotent upsert per filename
  for (const row of rows) {
    await db.audioFile.upsert({
      where: { originalName: row.originalName },
      update: {
        uri: row.uri,
        recordedAt: row.recordedAt,
        site: row.site,
        unitId: row.unitId,
        extension: row.extension,
      },
      create: row,
    });
  }

  console.log(`Upserted ${rows.length} audio rows.`);
}

main().finally(() => db.$disconnect());
