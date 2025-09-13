// src/app/page.tsx
export const runtime = "nodejs";        // Prisma needs Node runtime
export const dynamic = "force-dynamic"; // render on each request (no ISR)
export const revalidate = 0;

import Link from "next/link";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

type SortKey = "recordedAt" | "originalName" | "site" | "unitId";
type Dir = "asc" | "desc";
type SP = {
  page?: string;
  size?: string;
  sort?: string;
  dir?: string;
  q?: string;
};

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<SP> | SP;
}) {
  const sp = (await Promise.resolve(searchParams)) ?? {};

  // ---- paging
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const size = Math.min(100, Math.max(10, Number(sp.size ?? 20) || 20));
  const skip = (page - 1) * size;

  // ---- sorting (whitelist)
  const allowedSorts: SortKey[] = ["recordedAt", "originalName", "site", "unitId"];
  const sortKey: SortKey = allowedSorts.includes(sp.sort as SortKey)
    ? (sp.sort as SortKey)
    : "recordedAt";
  const dir: Dir = sp.dir === "desc" ? "desc" : "asc";

 // ---- filter (quick search)
const q = (sp.q ?? "").trim();
const where: Prisma.AudioFileWhereInput | undefined = q
  ? {
      OR: [
        { originalName: { contains: q } },
        { site:         { contains: q } },
        { unitId:       { contains: q } },
      ],
    }
  : undefined;


  // ---- queries (keep args plain; never pass undefined keys)
  const total = await (where ? db.audioFile.count({ where }) : db.audioFile.count());

  const orderBy: Prisma.AudioFileOrderByWithRelationInput = {
    [sortKey]: dir,
  } as any;

  const files = await db.audioFile.findMany({
    ...(where ? { where } : {}),
    orderBy,
    skip,
    take: size,
    include: { _count: { select: { segments: true } } },
  });

  const totalPages = Math.max(1, Math.ceil(total / size));

  const href = (over: Partial<SP>) => {
    const s = new URLSearchParams({
      page: String(over.page ?? page),
      size: String(over.size ?? size),
      sort: String(over.sort ?? sortKey),
      dir: String(over.dir ?? dir),
      q: over.q ?? q,
    });
    return `/?${s.toString()}`;
  };

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
      <form action="/" method="get" className="flex flex-wrap gap-3 items-end">
        <label className="text-sm">
          <div className="text-slate-600">Search</div>
          <input
            name="q"
            defaultValue={q}
            placeholder="name, site, unit..."
            className="border rounded px-2 py-1"
          />
        </label>

        <label className="text-sm">
          <div className="text-slate-600">Sort by</div>
          <select name="sort" defaultValue={sortKey} className="border rounded px-2 py-1">
            <option value="recordedAt">Recorded time</option>
            <option value="originalName">Filename</option>
            <option value="site">Site</option>
            <option value="unitId">Unit</option>
          </select>
        </label>

        <label className="text-sm">
          <div className="text-slate-600">Direction</div>
          <select name="dir" defaultValue={dir} className="border rounded px-2 py-1">
            <option value="asc">Asc</option>
            <option value="desc">Desc</option>
          </select>
        </label>

        <label className="text-sm">
          <div className="text-slate-600">Page size</div>
          <select name="size" defaultValue={size} className="border rounded px-2 py-1">
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </label>

        <input type="hidden" name="page" value="1" />
        <button type="submit" className="border rounded px-3 py-1">Apply</button>
      </form>

      {/* Stats */}
      <div className="text-sm text-slate-600">
        Showing <b>{files.length}</b> of <b>{total}</b> file(s).
      </div>

      {/* Grid */}
      <ul className="grid gap-3 md:grid-cols-2">
        {files.map((f) => {
          const c = f._count.segments;
          const has = c > 0;
          return (
            <li key={f.id} className="border rounded p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="font-mono text-sm truncate">{f.originalName}</div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    has ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"
                  }`}
                  title={`${c} annotation${c === 1 ? "" : "s"}`}
                >
                  {c}
                </span>
              </div>
              <div className="text-xs text-slate-500 mb-2">
                {f.site ?? "—"} {f.unitId ? `· ${f.unitId}` : ""}{" "}
                {f.recordedAt ? `· ${new Date(f.recordedAt).toISOString()}` : ""}
              </div>
              <Link className="inline-block text-blue-600 underline" href={`/annotate/${f.id}`}>
                Annotate
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
