import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// Canonical: SITE[-UNIT]_YYYYMMDD_HHMMSS[_SEQ].wav
const CANON_RE = /^([A-Za-z0-9-]+?)(?:-([A-Za-z0-9-]+))?_(\d{8})_(\d{6})(?:_(\d{1,}))?\.wav$/i;

type Parsed = {
  site: string;
  unitId: string | null;
  recordedAt: Date; // UTC
  ext: string;
  seq?: number;
};

function parseCanonical(name: string): Parsed {
  const base = name.replace(/^.*\//, "");
  const dot = base.lastIndexOf(".");
  const stem = dot >= 0 ? base.slice(0, dot) : base;
  const ext = dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
  if (ext !== "wav") throw new Error(`Not a .wav: ${name}`);

  const m = stem.match(CANON_RE);
  if (!m) throw new Error(`Bad filename (expect SITE[-UNIT]_YYYYMMDD_HHMMSS[_SEQ].wav): ${name}`);

  const [, site, unitMaybe, ymd, hms, seqStr] = m;
  const y = Number(ymd.slice(0, 4));
  const mo = Number(ymd.slice(4, 6));
  const d = Number(ymd.slice(6, 8));
  const H = Number(hms.slice(0, 2));
  const M = Number(hms.slice(2, 4));
  const S = Number(hms.slice(4, 6));
  const recordedAt = new Date(Date.UTC(y, mo - 1, d, H, M, S));

  return { site, unitId: unitMaybe ?? null, recordedAt, ext, seq: seqStr ? Number(seqStr) : undefined };
}

export async function ingestProjectAudio(opts: { projectId: string; reset?: boolean }) {
  const { projectId, reset } = opts;
  const audioDir = path.join(process.cwd(), "public", "audio");
  const files = fs.readdirSync(audioDir).filter(f => f.toLowerCase().endsWith(".wav")).sort();

  // Make sure the project exists
  const project = await db.project.upsert({
    where: { id: projectId },
    update: {},
    create: { id: projectId, name: `${projectId} Project` },
  });

  if (reset) {
    await db.audioFile.deleteMany({ where: { projectId } });
  }

  // Ensure default labels exist for this project (idempotent)
  for (const l of [
    { name: "frog", color: "#22c55e", hotkey: "1" },
    { name: "not-frog", color: "#ef4444", hotkey: "2" },
    { name: "species", color: "#3b82f6", hotkey: "3" },
  ]) {
    await db.label.upsert({
      where: { projectId_name: { projectId, name: l.name } },
      update: l,
      create: { projectId, ...l },
    });
  }

  let created = 0;
  let updated = 0;
  const bad: string[] = [];

  for (const fn of files) {
    let parsed: Parsed | null = null;
    try {
      parsed = parseCanonical(fn);
    } catch {
      bad.push(fn);
      continue;
    }

    const row = {
      projectId,
      originalName: fn,
      uri: `/audio/${encodeURIComponent(fn)}`,
      recordedAt: parsed.recordedAt,
      site: parsed.site,
      unitId: parsed.unitId,
      extension: parsed.ext,
      sequence: parsed.seq ?? null, // only if your schema includes sequence
    };

    const existing = await db.audioFile.findUnique({
      where: { projectId_originalName: { projectId, originalName: fn } },
      select: { id: true },
    });

    if (!existing) {
      await db.audioFile.create({ data: row });
      created++;
    } else {
      // update minimal mutable fields
      await db.audioFile.update({
        where: { projectId_originalName: { projectId, originalName: fn } },
        data: {
          uri: row.uri,
          recordedAt: row.recordedAt,
          site: row.site,
          unitId: row.unitId,
          extension: row.extension,
          sequence: row.sequence as any,
          lastModifiedAt: new Date(),
        },
      });
      updated++;
    }
  }

  return {
    projectId: project.id,
    stats: {
      scanned: files.length,
      created,
      updated,
      bad,
    },
  };
}
