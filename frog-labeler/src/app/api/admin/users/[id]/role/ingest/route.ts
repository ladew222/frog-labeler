export const runtime = "nodejs"; // we need fs/path
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import fs from "fs";
import path from "path";

// keep the same parse function from your script
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

  // strip trailing suffix like _1/_copy/_final
  rest = rest.replace(/_[A-Za-z0-9-]+$/, "");

  // 1) canonical: YYYYMMDD_HHMMSS
  const m = rest.match(/^(\d{8})_(\d{6})$/);
  if (m) {
    const [_, ymd, hms] = m;
    const iso = `${ymd.slice(0,4)}-${ymd.slice(4,6)}-${ymd.slice(6,8)}T${hms.slice(0,2)}:${hms.slice(2,4)}:${hms.slice(4,6)}Z`;
    return { site, unitId, recordedAt: new Date(iso), ext };
  }

  // 2) human-readable date
  const restNorm = rest.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  const d = new Date(restNorm);
  if (!Number.isNaN(d.getTime())) {
    return { site, unitId, recordedAt: d, ext };
  }
  return null;
}

export async function POST() {
  // auth: admin only
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const audioDir = path.join(process.cwd(), "public", "audio");
  if (!fs.existsSync(audioDir)) {
    return NextResponse.json({ error: `Missing folder: ${audioDir}` }, { status: 400 });
  }

  const files = fs.readdirSync(audioDir).filter(f => f.toLowerCase().endsWith(".wav"));

  const project = await db.project.upsert({
    where: { id: "demo" },
    update: {},
    create: { id: "demo", name: "Demo Project" },
  });

  // default labels
  for (const l of [
    { name: "frog",     color: "#22c55e", hotkey: "1" },
    { name: "not-frog", color: "#ef4444", hotkey: "2" },
    { name: "species",  color: "#3b82f6", hotkey: "3" },
  ]) {
    await db.label.upsert({
      where: { projectId_name: { projectId: project.id, name: l.name } },
      update: l,
      create: { projectId: project.id, ...l },
    });
  }

  let created = 0;
  let updated = 0;
  const bad: string[] = [];

  for (const fn of files) {
    const p = parse(fn);
    if (!p) { bad.push(fn); continue; }

    const row = {
      projectId: project.id,
      originalName: fn,
      uri: `/audio/${encodeURIComponent(fn)}`,
      recordedAt: p.recordedAt,
      site: p.site,
      unitId: p.unitId,
      extension: p.ext,
    };

    const existing = await db.audioFile.findUnique({ where: { originalName: fn } });
    if (existing) {
      await db.audioFile.update({
        where: { originalName: fn },
        data: {
          uri: row.uri,
          recordedAt: row.recordedAt,
          site: row.site,
          unitId: row.unitId,
          extension: row.extension,
        },
      });
      updated++;
    } else {
      await db.audioFile.create({ data: row });
      created++;
    }
  }

  return NextResponse.json({
    ok: true,
    stats: { created, updated, scanned: files.length, bad },
  });
}
