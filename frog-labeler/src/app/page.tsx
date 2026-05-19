// src/app/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getUserProjectIds } from "@/lib/authz";
import type { Prisma } from "@prisma/client";
import { readActivityStatsForUri, type PeakStats } from "@/lib/peakStats";
import { loadModelReportForUri } from "@/lib/modelResults";





/* ----------------------------- types & helpers ----------------------------- */

type SortKey =
  | "recordedAt"
  | "originalName"
  | "site"
  | "unitId"
  | "annotations"
  | "lastModified";
type Dir = "asc" | "desc";
type SP = {
  page?: string;
  size?: string;
  sort?: string;
  dir?: string;
  q?: string;
  projectId?: string;
  site?: string;
  folder?: string; // NEW
  from?: string;   // ← NEW (YYYY-MM-DD)
  to?: string;     // ← NEW (YYYY-MM-DD)
  mdFrom?: string;   // e.g. "03-01"
  mdTo?: string;     // e.g. "05-31"
  notSilent?: string;
  modelStatus?: string;
  modelSpecies?: string;
};

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.345, "week"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];
  let unit: Intl.RelativeTimeFormatUnit = "second";
  let value = seconds;
  for (const [divisor, name] of units) {
    if (value < divisor) { unit = name; break; }
    value = Math.floor(value / divisor);
  }
  return rtf.format(-value, unit);
}

function Chip({
  label,
  value,
  href,
}: { label: string; value: string; href?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border">
      <span className="font-medium">{label}:</span> <span className="font-mono">{value}</span>
      {href ? (
        <Link href={href} className="ml-1 text-slate-500 hover:text-slate-800" title="Clear">✕</Link>
      ) : null}
    </span>
  );
}


function parseMd(v?: string) {
  const s = (v ?? "").trim();
  const m = /^(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const mm = Number(m[1]), dd = Number(m[2]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return { m: mm, d: dd };
}


function parseISODate(d?: string): Date | null {
  if (!d) return null;
  // Only accept YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const dt = new Date(d + "T00:00:00Z");
  return Number.isNaN(dt.getTime()) ? null : dt;
}
function endOfDayUTC(d: Date): Date {
  // exclusive upper bound: next day at 00:00Z
  const nd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
  return nd;
}


// Pull the first segment after `/audio/` and decode it.
function firstFolderFromUri(uri: string): string | null {
  if (!uri.startsWith("/audio/")) return null;
  const rest = uri.slice("/audio/".length);
  const seg = rest.split("/")[0] || "";
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg || null;
  }
}

function ActivityBadge({ s }: { s: PeakStats | null }) {
  if (!s) {
    return (
      <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-500">
        no stats
      </span>
    );
  }

  const pct = (s.activeRatio ?? 0) * 100;
  // crude “likely sound” heuristic; tweak as you like
  const likely = (s.p95 ?? 0) >= 3 || (s.score ?? 0) >= 35;

  if (pct < 0.5) {
    return (
      <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">
        Silent
      </span>
    );
  }
  if (likely) {
    return (
      <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">
        Likely sound · {pct.toFixed(1)}%
      </span>
    );
  }
  return (
    <span className="text-xs px-2 py-0.5 rounded bg-sky-100 text-sky-700">
      Activity · {pct.toFixed(1)}%
    </span>
  );
}

type ModelPreview = {
  species: string;
  count: number;
  verdict: string;
  confidence: number | null;
}[];

const MODEL_SPECIES_OPTIONS = [
  "Blanchards_Cricket_Frog",
  "Bullfrog",
  "Gray_Tree_Frog",
  "Green_Frog",
  "Northern_Leopard",
  "Peeper",
  "Southern_Leopard_Frog",
] as const;

function formatSpeciesName(name: string): string {
  return name.replaceAll("_", " ");
}

function speciesBadgeStyle(name: string) {
  const colors: Record<string, { bg: string; fg: string }> = {
    Blanchards_Cricket_Frog: { bg: "#ECF3D8", fg: "#4E6A1E" },
    Bullfrog: { bg: "#D9EEF8", fg: "#1F5F87" },
    Gray_Tree_Frog: { bg: "#EEE8F9", fg: "#5B4C8F" },
    Green_Frog: { bg: "#DDF4EC", fg: "#1D7A67" },
    Northern_Leopard: { bg: "#FBE6E0", fg: "#9A4F3C" },
    Peeper: { bg: "#FAEDC7", fg: "#A06A00" },
    Southern_Leopard_Frog: { bg: "#F3E2CF", fg: "#8A531A" },
  };
  return colors[name] || { bg: "#E5E7EB", fg: "#475569" };
}

function confidenceLabel(confidence: number | null | undefined) {
  if (confidence == null) return "unknown";
  if (confidence >= 0.75) return "high";
  if (confidence >= 0.5) return "moderate";
  return "low";
}

function ModelSummaryBadge({ model }: { model: ModelPreview | null }) {
  if (model == null) {
    return (
      <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-500">
        no model
      </span>
    );
  }
  if (model.length === 0) {
    return (
      <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">
        model: none
      </span>
    );
  }
  const lead = model[0];
  const colors = speciesBadgeStyle(lead.species);
  return (
    <span
      className="text-xs px-2 py-0.5 rounded"
      style={{ backgroundColor: colors.bg, color: colors.fg }}
      title={model.map((m) => `${formatSpeciesName(m.species)} ${m.count} (${confidenceLabel(m.confidence)})`).join(" · ")}
    >
      model: {formatSpeciesName(lead.species)} {lead.count}
      {model.length > 1 ? ` +${model.length - 1}` : ""} · {confidenceLabel(lead.confidence)}
    </span>
  );
}



/* --------------------------------- page ----------------------------------- */

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<SP> | SP;
}) {
  const sp = (await Promise.resolve(searchParams)) ?? {};

  // ----- auth -----
  const session = await getServerSession(authOptions);
  if (!session) redirect("/auth/signin");
  const globalRole = ((session.user as any)?.role ?? "pending") as "pending" | "user" | "admin";
  if (globalRole === "pending") redirect("/pending");
  const userId = (session.user as any).id as string;
  const isAdmin = globalRole === "admin";

  // ----- visible projects -----
  const visibleProjectIds = isAdmin
    ? (await db.project.findMany({ select: { id: true } })).map((p) => p.id)
    : await getUserProjectIds(userId);

  // Project filter (only if user can see it)
  const projectIdParam = (sp.projectId ?? "").trim();
  const projectIdFilterAllowed =
    projectIdParam && visibleProjectIds.includes(projectIdParam) ? projectIdParam : "";

  // ----- paging -----
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const size = Math.min(100, Math.max(10, Number(sp.size ?? 20) || 20));
  const skip = (page - 1) * size;

  // ----- sorting -----
  const allowedSorts: SortKey[] = [
    "recordedAt",
    "originalName",
    "site",
    "unitId",
    "annotations",
    "lastModified",
  ];
  const sortKey: SortKey = allowedSorts.includes(sp.sort as SortKey)
    ? (sp.sort as SortKey)
    : "recordedAt";
  const dir: Dir = sp.dir === "desc" ? "desc" : "asc";

  // ----- search + filters -----
  const q = (sp.q ?? "").trim();
  const siteParam   = (sp.site ?? "").trim();
  const folderParam = (sp.folder ?? "").trim();
  const notSilentParam = sp.notSilent === "true";
  const modelStatusParam = (sp.modelStatus ?? "").trim();
  const modelSpeciesParamRaw = (sp.modelSpecies ?? "").trim();
  const modelSpeciesParam = MODEL_SPECIES_OPTIONS.includes(modelSpeciesParamRaw as (typeof MODEL_SPECIES_OPTIONS)[number])
    ? modelSpeciesParamRaw
    : "";


  // date inputs
  const fromParam   = (sp.from ?? "").trim();   // YYYY-MM-DD
  const toParam     = (sp.to   ?? "").trim();   // YYYY-MM-DD
  const mdFromParam = (sp.mdFrom ?? "").trim(); // MM-DD (seasonal)
  const mdToParam   = (sp.mdTo   ?? "").trim(); // MM-DD (seasonal)
  const hasAbsDates = !!(fromParam || toParam);
  const hasSeason   = !!(mdFromParam || mdToParam);
  const dateModeConflict = hasAbsDates && hasSeason;


  const scopeFilter: Prisma.AudioFileWhereInput = visibleProjectIds.length
    ? { projectId: { in: visibleProjectIds } }
    : { id: { in: [] } };

  const projectPickFilter: Prisma.AudioFileWhereInput | undefined =
    projectIdFilterAllowed ? { projectId: projectIdFilterAllowed } : undefined;

  const qFilter: Prisma.AudioFileWhereInput | undefined = q
    ? {
        OR: [
          { originalName: { contains: q } },
          { site:        { contains: q } },
          { unitId:      { contains: q } },
        ],
      }
    : undefined;

  const siteFilter: Prisma.AudioFileWhereInput | undefined =
    siteParam ? { site: { equals: siteParam } } : undefined;

  const folderFilter: Prisma.AudioFileWhereInput | undefined =
    folderParam
      ? { uri: { startsWith: `/audio/${encodeURIComponent(folderParam)}/` } }
      : undefined;

  const notSilentFilter: Prisma.AudioFileWhereInput | undefined = notSilentParam
  ? { likelySound: { gt: 5 } } // adjust threshold as you like
  : undefined;


  // Base where WITHOUT any date restriction (to discover min/max year in scope)
  const baseWhere: Prisma.AudioFileWhereInput | undefined = (() => {
    const parts = [scopeFilter, projectPickFilter, qFilter, siteFilter, folderFilter]
      .filter(Boolean) as Prisma.AudioFileWhereInput[];
    return parts.length ? { AND: parts } : undefined;
  })();

  // Find min/max recordedAt in the current scope (single roundtrip)
  const mm = await db.audioFile.aggregate({
    where: baseWhere,
    _min: { recordedAt: true },
    _max: { recordedAt: true },
  });
  const minYear = mm._min.recordedAt ? mm._min.recordedAt.getUTCFullYear() : 2000;
  const maxYear = mm._max.recordedAt ? mm._max.recordedAt.getUTCFullYear() : minYear;

  // Build date condition
  const fromDate = parseISODate(fromParam);
  const toDate   = parseISODate(toParam);

  let dateWhere: Prisma.AudioFileWhereInput | undefined;

  if (fromDate || toDate) {
    // Absolute date wins if present
    dateWhere = {
      recordedAt: {
        ...(fromDate ? { gte: fromDate } : {}),
        ...(toDate   ? { lt: endOfDayUTC(toDate) } : {}), // exclusive upper bound
      },
    };
  } else {
    // Seasonal window across all years in scope
    const a = parseMd(mdFromParam);
    const b = parseMd(mdToParam);
    if (a && b) {
      const ranges: Prisma.AudioFileWhereInput[] = [];
      for (let y = minYear; y <= maxYear; y++) {
        const start = new Date(Date.UTC(y, a.m - 1, a.d, 0, 0, 0));
        const end   = new Date(Date.UTC(y, b.m - 1, b.d, 23, 59, 59));
        if (end >= start) {
          // same-year span
          ranges.push({ recordedAt: { gte: start, lte: end } });
        } else {
          // wraps new year (e.g., 11-15 → 02-20)
          const end1   = new Date(Date.UTC(y, 11, 31, 23, 59, 59));
          const start2 = new Date(Date.UTC(y, 0, 1, 0, 0, 0));
          const end2   = new Date(Date.UTC(y, b.m - 1, b.d, 23, 59, 59));
          ranges.push({ recordedAt: { gte: start, lte: end1 } });
          ranges.push({ recordedAt: { gte: start2, lte: end2 } });
        }
      }
      if (ranges.length) dateWhere = { OR: ranges };
    }
  }

  // Final WHERE
  const andFilters = [
    scopeFilter,
    projectPickFilter,
    qFilter,
    siteFilter,
    folderFilter,
    dateWhere,
    notSilentFilter, 
  ].filter(Boolean) as Prisma.AudioFileWhereInput[];

const where: Prisma.AudioFileWhereInput | undefined =
  andFilters.length ? { AND: andFilters } : undefined;


  const usingModelFilters = Boolean(modelStatusParam || modelSpeciesParam);


  // ----- orderBy -----
  let orderBy: Prisma.AudioFileOrderByWithRelationInput[] = [];
  switch (sortKey) {
    case "annotations":
      orderBy = [{ segments: { _count: dir } }, { id: "asc" }];
      break;
    case "lastModified":
      // @ts-ignore your schema likely has this
      orderBy = [{ lastModifiedAt: dir }, { id: "asc" }];
      break;
    default:
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      orderBy = [{ [sortKey]: dir } as any, { id: "asc" }];
  }

  // ----- options for filters -----
  const projectOptions = await db.project.findMany({
    where: { id: { in: visibleProjectIds } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const siteRows = await db.audioFile.findMany({
    where: projectPickFilter ? (projectPickFilter as Prisma.AudioFileWhereInput) : scopeFilter,
    select: { site: true },
    distinct: ["site"],
    orderBy: { site: "asc" },
  });
  const siteOptions = siteRows
    .map((r) => r.site)
    .filter((s): s is string => !!s && s.trim().length > 0);

  // Build folder options from URIs within current *project scope*
  const uriRows = await db.audioFile.findMany({
    where: projectPickFilter ? (projectPickFilter as Prisma.AudioFileWhereInput) : scopeFilter,
    select: { uri: true },
  });
  const folderSet = new Set<string>();
  for (const r of uriRows) {
    const f = firstFolderFromUri(r.uri);
    if (f) folderSet.add(f);
  }
  const folderOptions = Array.from(folderSet).sort((a, b) => a.localeCompare(b));

  // ----- data -----
// ----- data -----
const filesRaw = await db.audioFile.findMany({
  ...(where ? { where } : {}),
  orderBy,
  ...(usingModelFilters ? {} : { skip, take: size }),
  include: {
    _count: { select: { segments: true } },
    project: { select: { id: true, name: true } },
  },
});

// Attach precomputed stats server-side (no client fetch)
const enrichedFiles = await Promise.all(
  filesRaw.map(async (f) => {
    const stats = readActivityStatsForUri(f.uri);
    const report = await loadModelReportForUri(f.uri);
    const modelTop = report
      ? Object.entries(report.summary as Record<string, any>)
          .map(([species, item]) => ({
            species,
            count: Number(item?.headline_count ?? 0),
            verdict: String(item?.verdict ?? ""),
            confidence: item?.mean_confidence == null ? null : Number(item.mean_confidence),
          }))
          .filter((row) => row.count > 0)
          .sort((a, b) => b.count - a.count)
          .slice(0, 3)
      : null;
    return {
      ...f,
      __stats: stats as PeakStats | null,
      __modelTop: modelTop as ModelPreview | null,
    };
  })
);

const filteredFiles = enrichedFiles.filter((f) => {
  if (modelStatusParam === "available" && f.__modelTop == null) return false;
  if (modelStatusParam === "detected" && (!f.__modelTop || f.__modelTop.length === 0)) return false;
  if (modelStatusParam === "none" && (!f.__modelTop || f.__modelTop.length > 0)) return false;
  if (modelSpeciesParam) {
    const topSpecies = f.__modelTop?.[0]?.species ?? "";
    if (topSpecies !== modelSpeciesParam) return false;
  }
  return true;
});

const total = usingModelFilters ? filteredFiles.length : await (where ? db.audioFile.count({ where }) : db.audioFile.count());
const files = usingModelFilters ? filteredFiles.slice(skip, skip + size) : enrichedFiles;

  const totalPages = Math.max(1, Math.ceil(total / size));

  const href = (over: Partial<SP>) => {
    const s = new URLSearchParams({
      page:  String(over.page ?? page),
      size:  String(over.size ?? size),
      sort:  String(over.sort ?? sortKey),
      dir:   String(over.dir  ?? dir),
      q:       over.q       ?? q,
      projectId: over.projectId ?? projectIdFilterAllowed,
      site:      over.site      ?? siteParam,
      folder:    over.folder    ?? folderParam,
      from:   over.from   ?? fromParam,
      to:     over.to     ?? toParam,
      mdFrom: over.mdFrom ?? mdFromParam,
      mdTo:   over.mdTo   ?? mdToParam,
      notSilent: String(over.notSilent ?? notSilentParam),
      modelStatus: over.modelStatus ?? modelStatusParam,
      modelSpecies: over.modelSpecies ?? modelSpeciesParam,
    });
    return `/?${s.toString()}`;
  };



  /* --------------------------------- UI ----------------------------------- */

  return (
    <main className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Frog Labeler</h1>
        <Link
          href="/labels"
          className="inline-block bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700"
        >
          Manage Labels
        </Link>
      </div>

      {/* Controls */}
    <form action="/" method="get" className="flex flex-wrap items-end gap-3">
      {/* Row 1: Date filters */}
{/* DATE – single row, no internal wrap */}
<div className="inline-flex flex-nowrap items-end gap-2 border rounded px-2 py-1 text-xs whitespace-nowrap shrink-0">
  <span className="text-slate-700 mr-1">Date</span>

  <label className="flex flex-col">
    <span className="text-slate-600">From (UTC)</span>
    <input
      type="date"
      name="from"
      defaultValue={fromParam || ""}
      className="border rounded px-2 h-8 w-32"
      disabled={hasSeason}
    />
  </label>

  <label className="flex flex-col">
    <span className="text-slate-600">To (UTC)</span>
    <input
      type="date"
      name="to"
      defaultValue={toParam || ""}
      className="border rounded px-2 h-8 w-32"
      disabled={hasSeason}
    />
  </label>

  <label className="flex flex-col">
    <span className="text-slate-600">From (MM-DD)</span>
    <input
      name="mdFrom"
      defaultValue={mdFromParam}
      placeholder="MM-DD"
      className="border rounded px-2 h-8 w-20"
      pattern="\d{2}-\d{2}"
      disabled={hasAbsDates}
    />
  </label>

  <label className="flex flex-col">
    <span className="text-slate-600">To (MM-DD)</span>
    <input
      name="mdTo"
      defaultValue={mdToParam}
      placeholder="MM-DD"
      className="border rounded px-2 h-8 w-20"
      pattern="\d{2}-\d{2}"
      disabled={hasAbsDates}
    />
  </label>

  <Link
    href={href({ from: "", to: "", mdFrom: "", mdTo: "" })}
    className="border rounded px-2 h-8 inline-flex items-center hover:bg-slate-100"
    title="Clear all date filters"
  >
    Clear
  </Link>
</div>



      {/* Row 2: the rest of the compact controls */}
      <div className="flex flex-wrap gap-3 items-end">
        <label className="text-sm">
          <div className="text-slate-600">Search</div>
          <input
            name="q"
            defaultValue={q}
            placeholder="name, site, unit..."
            className="border rounded px-2 h-8"
          />
        </label>

        <label className="text-sm">
          <div className="text-slate-600">Project</div>
          <select
            name="projectId"
            defaultValue={projectIdFilterAllowed || ""}
            className="border rounded px-2 h-8"
          >
            <option value="">All projects</option>
            {projectOptions.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <div className="text-slate-600">Folder</div>
          <select name="folder" defaultValue={folderParam || ""} className="border rounded px-2 h-8">
            <option value="">All folders</option>
            {folderOptions.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <div className="text-slate-600">Site</div>
          <select name="site" defaultValue={siteParam || ""} className="border rounded px-2 h-8">
            <option value="">All sites</option>
            {siteOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <div className="text-slate-600">Model status</div>
          <select name="modelStatus" defaultValue={modelStatusParam || ""} className="border rounded px-2 h-8">
            <option value="">All files</option>
            <option value="available">Has model result</option>
            <option value="detected">Model detected species</option>
            <option value="none">Model says none</option>
          </select>
        </label>

        <label className="text-sm">
          <div className="text-slate-600">Top model species</div>
          <select name="modelSpecies" defaultValue={modelSpeciesParam || ""} className="border rounded px-2 h-8">
            <option value="">Any species</option>
            {MODEL_SPECIES_OPTIONS.map((species) => (
              <option key={species} value={species}>{formatSpeciesName(species)}</option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <div className="text-slate-600">Sort by</div>
          <select name="sort" defaultValue={sortKey} className="border rounded px-2 h-8">
            <option value="recordedAt">Recorded time</option>
            <option value="originalName">Filename</option>
            <option value="site">Site</option>
            <option value="unitId">Unit</option>
            <option value="annotations"># Annotations</option>
            <option value="lastModified">Last modified</option>
          </select>
        </label>

        <label className="text-sm">
          <div className="text-slate-600">Direction</div>
          <select name="dir" defaultValue={dir} className="border rounded px-2 h-8">
            <option value="asc">Asc</option>
            <option value="desc">Desc</option>
          </select>
        </label>

        <label className="text-sm">
          <div className="text-slate-600">Page size</div>
          <select name="size" defaultValue={size} className="border rounded px-2 h-8">
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </label>
        <label className="text-sm flex items-center gap-1 mt-2">
          <input
            type="checkbox"
            name="notSilent"
            value="true"
            defaultChecked={notSilentParam}
          />
          <span className="text-slate-700">Not silent only</span>
        </label>
        <input type="hidden" name="page" value="1" />
        <button type="submit" className="border rounded px-3 h-8 inline-flex items-center">
          Apply
        </button>
      </div>
    </form>


      {/* Stats */}
      <div className="text-sm text-slate-600">
        Showing <b>{files.length}</b> of <b>{total}</b> file(s)
        {projectIdFilterAllowed && (
          <> in project <b>{projectOptions.find(p => p.id === projectIdFilterAllowed)?.name ?? projectIdFilterAllowed}</b></>
        )}
        {folderParam && <> in folder <b>{folderParam}</b></>}
        {siteParam && <> at site <b>{siteParam}</b></>}.
      </div>
      {/* Active filters */}
        {(q || projectIdFilterAllowed || folderParam || siteParam || hasAbsDates || hasSeason || modelStatusParam || modelSpeciesParam) && (
          <div className="flex flex-wrap gap-2 items-center text-xs text-slate-700">
            <span className="mr-1">Active filters:</span>

            {q && <Chip label="Search" value={q} href={href({ q: "" })} />}

            {projectIdFilterAllowed && (
              <Chip
                label="Project"
                value={projectOptions.find(p => p.id === projectIdFilterAllowed)?.name ?? projectIdFilterAllowed}
                href={href({ projectId: "" })}
              />
            )}

            {folderParam && <Chip label="Folder" value={folderParam} href={href({ folder: "" })} />}
            {siteParam && <Chip label="Site" value={siteParam} href={href({ site: "" })} />}
            {modelStatusParam && <Chip label="Model" value={modelStatusParam} href={href({ modelStatus: "" })} />}
            {modelSpeciesParam && <Chip label="Top species" value={formatSpeciesName(modelSpeciesParam)} href={href({ modelSpecies: "" })} />}

            {hasAbsDates && (
              <Chip label="Date" value={`${fromParam || "…"} → ${toParam || "…"} (UTC)`} href={href({ from: "", to: "" })} />
            )}

            {hasSeason && (
              <Chip label="Season" value={`${mdFromParam || "…"} → ${mdToParam || "…"} (MM-DD)`} href={href({ mdFrom: "", mdTo: "" })} />
            )}

            <Link
              href={href({ q: "", projectId: "", site: "", folder: "", from: "", to: "", mdFrom: "", mdTo: "", modelStatus: "", modelSpecies: "" })}
              className="ml-2 text-slate-600 underline hover:text-slate-900"
            >
              Clear all
            </Link>
          </div>
        )}
      {/* Grid */}
      <ul className="grid gap-3 md:grid-cols-2">
        {files.map((f) => {
          const c = f._count.segments;
          const folder = firstFolderFromUri(f.uri) ?? "—";
          return (
            <li key={f.id} className="border rounded p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="font-mono text-sm truncate">{f.originalName}</div>
                <div className="flex items-center gap-2">
                  {isAdmin && (
                    <span
                      className="rounded px-2 py-0.5 text-xs bg-slate-100 text-slate-700"
                      title={`Project ID: ${f.project?.id}`}
                    >
                      {f.project?.name ?? f.project?.id}
                    </span>
                  )}

                  {/* 👇 new badge */}
                  <ActivityBadge s={f.__stats ?? null} />
                  <ModelSummaryBadge model={f.__modelTop ?? null} />

                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      c > 0 ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"
                    }`}
                    title={`${c} annotation${c === 1 ? "" : "s"}`}
                  >
                    {c}
                  </span>
                </div>

              </div>


              <div className="text-xs text-slate-500 mb-2">
                <span className="mr-1">📁 {folder}</span>
                {f.site ?? "—"} {f.unitId ? `· ${f.unitId}` : ""}{" "}
                {f.recordedAt ? `· ${new Date(f.recordedAt).toLocaleString("en-US")}` : ""}{" "}
                {/* @ts-ignore lastModifiedAt exists in your schema */}
                {f.lastModifiedAt ? `· modified ${timeAgo(new Date(f.lastModifiedAt))}` : ""}
              </div>

              {f.__modelTop && f.__modelTop.length > 0 && (
                <div className="mb-2 text-xs text-slate-700">
                  <span className="font-medium">Model:</span>{" "}
                  {f.__modelTop.map((row) => `${formatSpeciesName(row.species)} ${row.count} (${confidenceLabel(row.confidence)})`).join(" · ")}
                </div>
              )}

              <Link className="inline-block text-blue-600 underline" href={`/annotate/${f.id}`}>
                Annotate
              </Link>
              <span className="mx-2 text-slate-300">|</span>
              <Link className="inline-block text-emerald-700 underline" href={`/model/${f.id}`}>
                Model results
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Pager */}
      <div className="flex items-center gap-2 justify-center">
        <Link
          href={href({ page: Math.max(1, page - 1) })}
          aria-disabled={page <= 1}
          className={`border rounded px-3 py-1 ${page <= 1 ? "pointer-events-none opacity-50" : ""}`}
        >
          ← Prev
        </Link>
        <span className="text-sm text-slate-700">
          Page <b>{page}</b> / {totalPages}
        </span>
        <Link
          href={href({ page: Math.min(totalPages, page + 1) })}
          aria-disabled={page >= totalPages}
          className={`border rounded px-3 py-1 ${page >= totalPages ? "pointer-events-none opacity-50" : ""}`}
        >
          Next →
        </Link>
      </div>
    </main>
  );
}
