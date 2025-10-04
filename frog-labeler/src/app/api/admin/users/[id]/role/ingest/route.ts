// src/app/api/admin/ingest/route.ts
export const runtime = "nodejs"; // needs fs/path

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import fs from "node:fs";
import path from "node:path";
import { getSessionOrThrow, requireProjectRole } from "@/lib/authz";

/** Canonical: SITE[-UNIT]_YYYYMMDD_HHMMSS[_SEQ].wav (UTC) */
function parseCanonical(name: string) {
  const base = name.replace(/^.*\//, "");
  const dot = base.lastIndexOf(".");
  const stem = dot >= 0 ? base.slice(0, dot) : base;
  const ext = dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
  if (ext !== "wav") return null;

  const m = stem.match(/^([A-Za-z0-9-]+?)(?:-([A-Za-z0-9-]+))?_(\d{8})_(\d{6})(?:_(\d+))?$/);
  if (!m) return null;

  const [, site, unitMaybe, ymd, hms] = m;
  const y = Number(ymd.slice(0, 4));
  const mo = Number(ymd.slice(4, 6));
  const d = Number(ymd.slice(6, 8));
  const H = Number(hms.slice(0, 2));
  const M = Number(hms.slice(2, 4));
  const S = Number(hms.slice(4, 6));
  const recordedAt = new Date(Date.UTC(y, mo - 1, d, H, M, S));

  return { site, unitId: unitMaybe ?? "", recordedAt, ext };
}

/** Backward-compatible parser: canonical or human date filename */
function parseFlexible(name: string) {
  const base = name.replace(/^.*\//, "");
  const dot = base.lastIndexOf(".");
  const stem = dot >= 0 ? base.slice(0, dot) : base;
  const ext = dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
  if (ext !== "wav") return null;

  const us = stem.indexOf("_");
  if (us < 0) return null;

  const siteUnit = stem.slice(0, us);
  let rest = stem.slice(us + 1);

  const [site, unitId = ""] = siteUnit.includes("-") ? siteUnit.split("-") : [siteUnit, ""];

  // strip trailing suffix like _1/_copy/_final
  rest = rest.replace(/_[A-Za-z0-9-]+$/, "");

  // canonical: YYYYMMDD_HHMMSS
  const m = rest.match(/^(\d{8})_(\d{6})$/);
  if (m) {
    const [_, ymd, hms] = m;
    const iso = `${ymd.slice(0,4)}-${ymd.slice(4,6)}-${ymd.slice(6,8)}T${hms.slice(0,2)}:${hms.slice(2,4)}:${hms.slice(4,6)}Z`;
    return { site, unitId, recordedAt: new Date(iso), ext };
  }

  // human-readable date
  const restNorm = rest.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  const d2 = new Date(restNorm);
  if (!Number.isNaN(d2.getTime())) {
    return { site, unitId, recordedAt: d2, ext };
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const { user } = await getSessionOrThrow();

    const url = new URL(req.url);
    const projectId = (url.searchParams.get("projectId") || "").trim();
    const strict = url.searchParams.get("strict") === "true";

    const resetQuery = url.searchParams.get("reset");
    const body = await req.json().catch(() => ({}));
    const reset = (typeof body.reset === "boolean" ? body.reset : undefined) ?? (resetQuery === "true");

    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    // Must be ADMIN (or OWNER) on the project
    await requireProjectRole(user.id, projectId, "ADMIN");

    const audioDir = path.join(process.cwd(), "public", "audio");
    if (!fs.existsSync(audioDir)) {
      return NextResponse.json({ error: `Missing folder: ${audioDir}` }, { status: 400 });
    }

    if (reset) {
      await db.audioFile.deleteMany({ where: { projectId } });
    }

    // Ensure a few default labels exist (idempotent)
    for (const l of [
      { name: "frog",     color: "#22c55e", hotkey: "1" },
      { name: "not-frog", color: "#ef4444", hotkey: "2" },
      { name: "species",  color: "#3b82f6", hotkey: "3" },
    ]) {
      await db.label.upsert({
        where: { projectId_name: { projectId, name: l.name } },
        update: l,
        create: { projectId, ...l },
      });
    }

    const files = fs.readdirSync(audioDir).filter(f => f.toLowerCase().endsWith(".wav"));
    if (files.length === 0) {
      return NextResponse.json({
        ok: true,
        projectId,
        stats: { scanned: 0, created: 0, updated: 0, bad: [] },
        note: "No .wav files found in public/audio",
      });
    }

    let created = 0;
    let updated = 0;
    const bad: string[] = [];

    for (const fn of files) {
      const p = (strict ? parseCanonical : parseFlexible)(fn);
      if (!p) { bad.push(fn); continue; }

      const data = {
        projectId,
        originalName: fn,
        uri: `/audio/${encodeURIComponent(fn)}`,
        recordedAt: p.recordedAt,
        site: p.site,
        unitId: p.unitId,
        extension: p.ext,
        lastModifiedAt: new Date(),
      };

      const key = { projectId, originalName: fn }; // @@unique([projectId, originalName])
      const existing = await db.audioFile.findUnique({
        where: { projectId_originalName: key },
        select: { id: true },
      });

      if (!existing) {
        await db.audioFile.create({ data });
        created++;
      } else {
        await db.audioFile.update({ where: { projectId_originalName: key }, data });
        updated++;
      }
    }

    return NextResponse.json({
      ok: true,
      projectId,
      stats: { scanned: files.length, created, updated, bad },
    });
  } catch (e: any) {
    const msg = typeof e?.message === "string" ? e.message : "Internal error";
    const status = /Unauthorized/.test(msg) ? 401 : /Forbidden/.test(msg) ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
