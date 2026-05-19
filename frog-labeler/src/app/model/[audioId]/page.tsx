import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole, requireProjectRole } from "@/lib/authz";
import { loadModelReportForUri } from "@/lib/modelResults";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ audioId: string }> };

function formatSpeciesName(name: string) {
  return name.replaceAll("_", " ");
}

function confidenceLabel(confidence: number | null | undefined) {
  if (confidence == null) return "unknown";
  if (confidence >= 0.75) return "high";
  if (confidence >= 0.5) return "moderate";
  return "low";
}

export default async function ModelResultsPage({ params }: Params) {
  const { audioId } = await params;

  const { ok, role, session } = await requireRole("user");
  const userId = session?.user?.id;
  if (!ok || !userId) {
    console.warn("Blocked model results access for role:", role);
    redirect("/pending");
  }

  const audio = await db.audioFile.findUnique({
    where: { id: audioId },
    select: {
      id: true,
      originalName: true,
      uri: true,
      recordedAt: true,
      projectId: true,
      project: { select: { name: true } },
      segments: {
        select: {
          label: { select: { name: true, color: true } },
        },
      },
    },
  });

  if (!audio) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <p className="text-red-700">Audio file not found.</p>
      </main>
    );
  }

  await requireProjectRole(userId, audio.projectId, "VIEWER");

  const report = await loadModelReportForUri(audio.uri);
  const gtCounts = new Map<string, number>();
  for (const seg of audio.segments) {
    const name = seg.label.name;
    gtCounts.set(name, (gtCounts.get(name) || 0) + 1);
  }

  const summaryRows = report
    ? Object.entries(report.summary as Record<string, any>).map(([species, item]) => ({
        species,
        verdict: item.verdict,
        headlineCount: item.headline_count,
        countBasis: item.count_basis,
        activeSeconds: item.active_seconds,
        confidence: item.mean_confidence,
        gtCount: gtCounts.get(species) || 0,
      }))
    : [];

  const topSpecies = summaryRows
    .filter((row) => Number(row.headlineCount) > 0)
    .sort((a, b) => Number(b.headlineCount) - Number(a.headlineCount))
    .slice(0, 3);

  return (
    <main className="mx-auto max-w-7xl p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-slate-500">
            <Link href="/" className="underline hover:text-slate-800">Files</Link>
            <span className="mx-2">/</span>
            <Link href={`/annotate/${audio.id}`} className="underline hover:text-slate-800">Annotate</Link>
            <span className="mx-2">/</span>
            <span>Model results</span>
          </div>
          <h1 className="text-2xl font-semibold mt-2">Model results for {audio.originalName}</h1>
          <p className="text-sm text-slate-600 mt-1">
            {audio.project?.name ?? audio.projectId} · {audio.uri}
          </p>
        </div>
        <div className="flex gap-3">
          <Link href={`/annotate/${audio.id}`} className="rounded border px-3 py-2 text-sm hover:bg-slate-50">
            Open annotator
          </Link>
          {report && (
            <a
              href={`/model-view/${audio.id}/index.html`}
              target="_blank"
              rel="noreferrer"
              className="rounded border px-3 py-2 text-sm hover:bg-slate-50"
            >
              Open full visualization
            </a>
          )}
        </div>
      </div>

      {!report ? (
        <section className="rounded border bg-white p-5">
          <h2 className="text-lg font-medium">No model result found yet</h2>
          <p className="text-sm text-slate-600 mt-2">
            This file does not currently have a generated model-visualization folder in the scan output directory.
          </p>
        </section>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-3">
            <div className="rounded border bg-emerald-50 p-4">
              <div className="text-sm font-medium text-emerald-800">Preset</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{report.preset}</div>
              <p className="mt-1 text-sm text-slate-600">Hop {report.hop_sec}s · threshold {report.prob_threshold}</p>
            </div>
            <div className="rounded border bg-sky-50 p-4">
              <div className="text-sm font-medium text-sky-800">Top predicted species</div>
              <div className="mt-2 space-y-1">
                {topSpecies.length === 0 ? (
                  <div className="text-sm text-slate-600">No species detected</div>
                ) : topSpecies.map((row) => (
                  <div key={row.species} className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-900">{formatSpeciesName(row.species)}</span>
                    <span className="text-slate-700">
                      {row.headlineCount} · {confidenceLabel(row.confidence)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded border bg-amber-50 p-4">
              <div className="text-sm font-medium text-amber-800">Interpretation</div>
              <p className="mt-2 text-sm text-slate-700">
                Use this as a species-activity review view. Counts are rough and may exceed tags if files contain untagged calls.
              </p>
            </div>
          </section>

          <section className="rounded border bg-white p-4">
            <h2 className="text-lg font-medium">Predicted summary vs current labels</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="px-3 py-2 text-left">Species</th>
                    <th className="px-3 py-2 text-left">Verdict</th>
                    <th className="px-3 py-2 text-right">Pred count</th>
                    <th className="px-3 py-2 text-right">Tagged count</th>
                    <th className="px-3 py-2 text-left">Basis</th>
                    <th className="px-3 py-2 text-right">Active s</th>
                    <th className="px-3 py-2 text-right">Mean conf</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryRows.map((row) => (
                    <tr key={row.species} className="border-b last:border-b-0">
                      <td className="px-3 py-2 font-medium">{formatSpeciesName(row.species)}</td>
                      <td className="px-3 py-2">{row.verdict}</td>
                      <td className="px-3 py-2 text-right">{row.headlineCount}</td>
                      <td className="px-3 py-2 text-right">{row.gtCount}</td>
                      <td className="px-3 py-2">{row.countBasis}</td>
                      <td className="px-3 py-2 text-right">{Number(row.activeSeconds || 0).toFixed(1)}</td>
                      <td className="px-3 py-2 text-right">
                        {row.confidence == null
                          ? "—"
                          : `${Number(row.confidence).toFixed(2)} (${confidenceLabel(row.confidence)})`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded border bg-white p-2">
            <div className="border-b px-3 py-2 text-sm font-medium text-slate-700">
              Full visualization
            </div>
            <iframe
              src={`/model-view/${audio.id}/index.html`}
              title={`Model results for ${audio.originalName}`}
              className="h-[900px] w-full"
            />
          </section>
        </>
      )}
    </main>
  );
}
