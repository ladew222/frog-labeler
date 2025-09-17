"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.esm.js";
import SpectrogramPlugin from "wavesurfer.js/dist/plugins/spectrogram.esm.js";

type AudioRow = { id: string; originalName: string; uri: string; recordedAt: string | null };
type LabelRow = { id: string; name: string; hotkey: string | null; color?: string | null };


const toNum = (v: number | "") =>
  v === "" || Number.isNaN(Number(v)) ? undefined : Number(v);



// ⬇️ include optional fields we added to the DB
type SegmentRow = {
  id: string;
  audioId: string;
  startS: number;
  endS: number;
  labelId: string;
  label: { id: string; name: string; color: string | null; hotkey: string | null };
  individuals?: number | null;
  callingRate?: number | null;
  quality?: string | null;
  notes?: string | null;
  confidence?: number | null;
};

async function fetchAudio(id: string): Promise<AudioRow> {
  const r = await fetch(`/api/audio/${id}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`GET /api/audio/${id} -> ${r.status}`);
  return r.json();
}
async function fetchLabels(): Promise<LabelRow[]> {
  const r = await fetch(`/api/labels`, { cache: "no-store" });
  if (!r.ok) throw new Error(`GET /api/labels -> ${r.status}`);
  return r.json();
}
async function fetchSegments(audioId: string): Promise<SegmentRow[]> {
  const r = await fetch(`/api/audio/${audioId}/segments`, { cache: "no-store" });
  if (!r.ok) throw new Error(`GET /api/audio/${audioId}/segments -> ${r.status}`);
  return r.json();
}

async function updateSegment(segmentId: string, data: Partial<SegmentRow>): Promise<SegmentRow> {
  const r = await fetch(`/api/segments/${segmentId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`PUT /api/segments/${segmentId} -> ${r.status}`);
  return r.json();
}


export default function Annotator({ audioId }: { audioId: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const spectroRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null);


  // ---- helpers that need access to wsRef/regionsRef ----

const shortId = (id: string) => id.slice(-4);

function getRegionBySegmentId(segId: string) {
  const regions = regionsRef.current as any;
  if (!regions) return null;
  if (typeof regions.getRegion === "function") return regions.getRegion("seg_" + segId) ?? null;
  const list = regions.getRegions?.() ?? [];
  return list.find((r: any) => r.id === "seg_" + segId) ?? null;
}

function focusRegion(segId: string, play = false) {
  const ws = wsRef.current;
  const r = getRegionBySegmentId(segId);
  if (!ws || !r) return;
  const { start, end } = r;
  ws.setTime(start + Math.min(0.05, Math.max(0, end - start) / 2));
  if (play) ws.play(start, end);
  try {
    const el = (r as any).element as HTMLElement | undefined;
    el?.classList.add("ring-2", "ring-amber-400");
    setTimeout(() => el?.classList.remove("ring-2", "ring-amber-400"), 600);
  } catch {}
}

function highlightRegion(segId: string, on: boolean) {
  const r = getRegionBySegmentId(segId);
  if (!r) return;
  try {
    const el = (r as any).element as HTMLElement | undefined;
    if (on) el?.classList.add("ring-2", "ring-sky-400");
    else el?.classList.remove("ring-2", "ring-sky-400");
  } catch {}
}


const pendingId = "__pending";

const [audio, setAudio] = useState<AudioRow | null>(null);
const [labels, setLabels] = useState<LabelRow[]>([]);
const [segments, setSegments] = useState<SegmentRow[]>([]);
const [err, setErr] = useState<string | null>(null);

const [duration, setDuration] = useState<number>(0);
const [selStart, setSelStart] = useState<number>(0);
const [selEnd, setSelEnd] = useState<number>(0);

const [saving, setSaving] = useState(false);
const [toast, setToast] = useState<string | null>(null);

// ⬇️ NEW: local inputs that apply to the *next* tag you save
const [individuals, setIndividuals] = useState<number | "">("");
const [callingRate, setCallingRate] = useState<number | "">("");
const [quality, setQuality] = useState<string>("");
const [notes, setNotes] = useState<string>("");
const [confidence, setConfidence] = useState<number | "">("");

  // which row is being edited
const [editingId, setEditingId] = useState<string | null>(null);

// working copy of fields while editing
type Draft = {
  individuals?: number | "";
  callingRate?: number | "";
  quality?: string;
  notes?: string;
  confidence?: number | "";
};
const [draft, setDraft] = useState<Draft>({});
const [savingEdit, setSavingEdit] = useState(false);

function startEdit(s: SegmentRow) {
  setEditingId(s.id);
  setDraft({
    individuals: s.individuals ?? "",
    callingRate: s.callingRate ?? "",
    quality: s.quality ?? "",
    notes: s.notes ?? "",
    confidence: s.confidence ?? "",
  });
}

function cancelEdit() {
  setEditingId(null);
  setDraft({});
}


  useEffect(() => {
    (async () => {
      try {
        const [a, ls, segs] = await Promise.all([
          fetchAudio(audioId),
          fetchLabels(),
          fetchSegments(audioId),
        ]);
        setAudio(a);
        setLabels(ls);
        setSegments(segs);
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load");
        console.error(e);
      }
    })();
  }, [audioId]);

  const labelById = useMemo(() => {
    const m: Record<string, LabelRow> = {};
    for (const l of labels) m[l.id] = l;
    return m;
  }, [labels]);

  const hotkeyToLabelId = useMemo(() => {
    const m: Record<string, string> = {};
    for (const l of labels) if (l.hotkey) m[l.hotkey] = l.id;
    return m;
  }, [labels]);


  // ----- WaveSurfer init -----
  useEffect(() => {
    if (!audio || !containerRef.current || !spectroRef.current) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      height: 160,
      waveColor: "#94a3b8",
      progressColor: "#22c55e",
      cursorColor: "#0f172a",
      backend: "MediaElement",
    });

    const regions = ws.registerPlugin(RegionsPlugin.create({ dragSelection: false }));

    // keep sliders in sync when user drags/resizes the pending region
    const EPS = 1e-4;
    const syncFromRegion = (r: any) => {
      if (!r || String(r.id) !== pendingId) return;
      if (Math.abs(r.start - selStart) > EPS) setSelStart(r.start);
      if (Math.abs(r.end - selEnd) > EPS) setSelEnd(r.end);
    };
    regions.on("region-updated", syncFromRegion);
    regions.on("region-update-end", syncFromRegion);

    regionsRef.current = regions;

    // handle clicks on regions → scroll and flash table row
    const onRegionClicked = (r: any) => {
      const id = String(r.id || "");
      if (!id.startsWith("seg_")) return;
      const segId = id.slice(4);
      const row = document.querySelector<HTMLTableRowElement>(`[data-seg-row="${segId}"]`);
      if (row) {
        row.scrollIntoView({ block: "center", behavior: "smooth" });
        row.classList.add("bg-yellow-50");
        setTimeout(() => row.classList.remove("bg-yellow-50"), 800);
      }
    };
    regions.on("region-clicked", onRegionClicked);


    ws.registerPlugin(
      SpectrogramPlugin.create({
        container: spectroRef.current,
        height: 220,
        labels: true,
        fftSamples: 2048,
      }),
    );

    wsRef.current = ws;
    ws.load(audio.uri);

    ws.on("error", (e: any) => {
      if (e?.name === "AbortError") return;
      console.error("WaveSurfer error:", e);
    });

    ws.on("ready", () => {
      const d = ws.getDuration() || 0;
      setDuration(d);
      const start = 0;
      const end = Math.min(1, Math.max(0.05, d));
      setSelStart(start);
      setSelEnd(end);
      syncPendingRegion(start, end);
      

      // draw saved regions – don't rely on effect here
      for (const s of segments) {
        const base = s.label.color ?? "#22c55e";
        const col = base.startsWith("rgba") || base.startsWith("rgb") ? base : baseToRgba(base, 0.25);
        regions.addRegion({
          id: "seg_" + s.id,
          start: s.startS,
          end: s.endS,
          color: col,
          content: chipEl(`${s.label.name} · …${shortId(s.id)}`, base),
          drag: false,
          resize: false,
        });
      }
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") { e.preventDefault(); ws.playPause(); return; }
      if (e.key === "[") {
        const t = ws.getCurrentTime();
        const end = Math.max(t + 0.05, selEnd);
        const s = Math.min(t, end - 0.01);
        setSelStart(s); setSelEnd(end); syncPendingRegion(s, end); return;
      }
      if (e.key === "]") {
        const t = ws.getCurrentTime();
        const s = Math.min(t, selStart);
        const e2 = Math.max(t, s + 0.05);
        setSelStart(s); setSelEnd(e2); syncPendingRegion(s, e2); return;
      }
      if (e.key === "l") { ws.play(selStart, selEnd); return; }
      const labelId = hotkeyToLabelId[e.key];
      if (labelId) { e.preventDefault(); void saveCurrentSelection(labelId); }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
      try {
        // unsubscribe region listeners to avoid dupes/memory leaks
        regions.off?.("region-updated", syncFromRegion);
        regions.off?.("region-update-end", syncFromRegion);
        regions.off?.("region-clicked", onRegionClicked);


      } catch {}
      try {
        // @ts-ignore
        const el: HTMLMediaElement | undefined = ws.getMediaElement?.();
        if (el) { el.pause(); el.src = ""; el.load(); }
        ws.unAll();
        setTimeout(() => { try { ws.destroy(); } catch {} }, 0);
      } catch {}
      wsRef.current = null;
      regionsRef.current = null;
    };
  }, [audio, hotkeyToLabelId]); // ← only these deps

  // keep a single pending region instance
  const pendingRegionRef = useRef<any>(null);

  // Re-render saved segments when `segments` changes
  useEffect(() => {
    const regions = regionsRef.current;
    const ws = wsRef.current;
    if (!regions || !ws) return;

    // Remove existing saved regions (but keep the pending one)
    regions.getRegions().forEach((r: any) => {
      if (r.id && String(r.id).startsWith("seg_")) r.remove();
    });



    // Draw current saved segments
    for (const s of segments) {
      const base = s.label.color ?? "#22c55e";
      const col = base.startsWith("rgba") || base.startsWith("rgb") ? base : baseToRgba(base, 0.25);
      regions.addRegion({
        id: "seg_" + s.id,
        start: s.startS,
        end: s.endS,
        color: col,
        content: chipEl(`${s.label.name} · …${shortId(s.id)}`, base),
        drag: false,
        resize: false,
      });
    }

    if (duration > 0) syncPendingRegion(selStart, selEnd);
  }, [segments, duration]); // only redraw on segment list or duration change

  function syncPendingRegion(start: number, end: number) {
    const regions = regionsRef.current;
    if (!regions) return;
    const minLen = 0.02;
    const s = Math.max(0, Math.min(start, end - minLen));
    const e = Math.max(s + minLen, end);
    const el = chipEl("pending", "rgba(34,197,94,0.5)");

    const r = pendingRegionRef.current;
    if (r && typeof r.update === "function") {
      r.update({ start: s, end: e, color: "rgba(34,197,94,0.28)", content: el, drag: true, resize: true });
      return;
    }
    regions.getRegions().forEach((rg: any) => { if (rg.id === pendingId) rg.remove(); });
    const created = regions.addRegion({
      id: pendingId, start: s, end: e, color: "rgba(34,197,94,0.28)", content: el, drag: true, resize: true,
    });
    pendingRegionRef.current = created;
  }

  function clearPending() {
    try { pendingRegionRef.current?.remove(); } catch {}
    pendingRegionRef.current = null;
  }

  useEffect(() => { if (duration > 0) syncPendingRegion(selStart, selEnd); }, [selStart, selEnd, duration]);

  async function saveEdit(segmentId: string) {
    setSavingEdit(true);
    try {
      const updated = await updateSegment(segmentId, {
        individuals: toNum(draft.individuals ?? ""),
        callingRate: toNum(draft.callingRate ?? ""),
        quality: (draft.quality ?? "").trim() || null,
        notes: (draft.notes ?? "").trim() || null,
        confidence: toNum(draft.confidence ?? ""),
      });

      // merge back into local state (keep existing label object)
      setSegments(prev =>
        prev.map(s => (s.id === segmentId ? { ...s, ...updated } : s))
      );

      setEditingId(null);
      setDraft({});
      setToast("Updated ✓");
      setTimeout(() => setToast(null), 1000);
    } catch (e) {
      console.error(e);
      setToast("Update failed");
      setTimeout(() => setToast(null), 1200);
    } finally {
      setSavingEdit(false);
    }
  }


  async function saveCurrentSelection(labelId: string) {
    if (!audio) return;
    const start = Math.max(0, selStart);
    const end = Math.min(duration || selEnd, selEnd);
    if (!(end > start)) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/audio/${audio.id}/segments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioId: audio.id,
          startS: start,
          endS: end,
          labelId,
          // ⬇️ include optional fields if provided
          individuals: toNum(individuals),
          callingRate: toNum(callingRate),
          quality: quality.trim() ? quality.trim() : undefined,
          notes: notes.trim() ? notes.trim() : undefined,
          confidence: toNum(confidence), 
        }),
      });
      if (!res.ok) throw new Error(`POST /api/audio/${audio.id}/segments -> ${res.status}`);
      const saved: SegmentRow = await res.json();

      const base = labelById[labelId]?.color ?? "#22c55e";
      const col = base.startsWith("rgba") || base.startsWith("rgb") ? base : baseToRgba(base, 0.25);

      regionsRef.current?.addRegion({
        id: "seg_" + saved.id,
        start, end, color: col,
        content: chipEl(`${labelById[labelId]?.name ?? "label"} · …${shortId(saved.id)}`, base),
        drag: false, resize: false,
      });

      clearPending();
      setSegments((prev) => [...prev, { ...saved, label: { ...labelById[labelId] } as any }]);
      setToast("Saved ✓");
      setTimeout(() => setToast(null), 1000);

      // reset optional inputs after a successful save
      setIndividuals("");
      setCallingRate("");
      setQuality("");
      setNotes("");
      setConfidence("");
    } catch (e) {
      console.error(e);
      setToast("Save failed");
      setTimeout(() => setToast(null), 1200);
    } finally {
      setSaving(false);
    }
  }

  

  // delete handler INSIDE the component
  const handleDelete = useCallback(async (segmentId: string) => {
    if (!confirm("Delete this segment?")) return;
    try {
      const res = await fetch(`/api/segments/${segmentId}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(`DELETE /api/segments/${segmentId} -> ${res.status}`);

      let region: any;
      // @ts-ignore
      if (regionsRef.current?.getRegion) {
        // @ts-ignore
        region = regionsRef.current.getRegion("seg_" + segmentId);
      } else {
        region = regionsRef.current?.getRegions()?.find((r: any) => r.id === "seg_" + segmentId);
      }
      try { region?.remove(); } catch {}

      setSegments((prev) => prev.filter((s) => s.id !== segmentId));
    } catch (e) {
      console.error(e);
      alert("Failed to delete segment");
    }
  }, []);

  const fmt = (x?: number | null) => (x == null ? "—" : x.toFixed(2));

  if (err) return <div className="p-6 text-red-600">Error: {err}</div>;
  if (!audio) return <div className="p-6">Loading…</div>;

  

  return (
    <div className="p-6 space-y-4">
      <Link href="/" className="inline-block text-blue-600 underline hover:text-blue-800 text-sm">
        ← Back to file list
      </Link>

      <h1 className="text-xl font-semibold">
        Annotate: <span className="font-mono">{audio.originalName}</span>
      </h1>

      <div ref={containerRef} className="rounded border relative" />
      <div ref={spectroRef} className="rounded border" />

      {/* Selection controls */}
      <div className="text-sm border rounded p-3 space-y-2">
        <div className="flex items-center gap-3">
          <button type="button" className="border px-2 py-1 rounded" onClick={() => wsRef.current?.playPause()}>
            ▶/⏸
          </button>
          <button type="button" className="border px-2 py-1 rounded" onClick={() => wsRef.current?.play(selStart, selEnd)}>
            Loop sel
          </button>
          <span className="text-slate-600 ml-2">
            Selection: <code>{fmt(selStart)}</code> → <code>{fmt(selEnd)}</code> / <code>{fmt(duration)}</code> s
          </span>
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          <label className="flex items-center gap-2">
            Start
            <input
              type="range" min={0} max={Math.max(0.01, duration)} step={0.01} value={selStart}
              onChange={(e) => { const v = Math.min(parseFloat(e.target.value), selEnd - 0.01); setSelStart(Math.max(0, v)); }}
              className="w-full"
            />
            <code>{fmt(selStart)}</code>
            <button
              type="button" className="border px-1 py-0.5 rounded" title="Set from playhead ["
              onClick={() => {
                const t = wsRef.current?.getCurrentTime() ?? selStart;
                const v = Math.min(t, selEnd - 0.01);
                setSelStart(Math.max(0, v));
              }}
            >
              [ from playhead
            </button>
          </label>

          <label className="flex items-center gap-2">
            End
            <input
              type="range" min={0} max={Math.max(0.01, duration)} step={0.01} value={selEnd}
              onChange={(e) => { const v = Math.max(parseFloat(e.target.value), selStart + 0.01); setSelEnd(Math.min(duration || v, v)); }}
              className="w-full"
            />
            <code>{fmt(selEnd)}</code>
            <button
              type="button" className="border px-1 py-0.5 rounded" title="Set from playhead ]"
              onClick={() => {
                const t = wsRef.current?.getCurrentTime() ?? selEnd;
                const v = Math.max(t, selStart + 0.01);
                setSelEnd(Math.min(duration || v, v));
              }}
            >
              ] from playhead
            </button>
          </label>
        </div>
      </div>

      {/* Extra annotation fields */}
      <div className="text-sm border rounded p-3 space-y-3">
        <div className="font-medium">Extra annotation (optional)</div>
        <div className="grid gap-3 md:grid-cols-5">
          <label className="flex items-center gap-2">
            Individuals
            <input
              type="number"
              min={0}
              className="border rounded px-2 py-1 w-24"
              value={individuals}
              onChange={(e) => setIndividuals(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </label>

          <label className="flex items-center gap-2">
            Calling rate
            <input
              type="number"
              min={0}
              step="0.1"
              className="border rounded px-2 py-1 w-28"
              value={callingRate}
              onChange={(e) => setCallingRate(e.target.value === "" ? "" : Number(e.target.value))}
              title="Calls per second (or your unit)"
            />
          </label>

          <label className="flex items-center gap-2">
            Quality
            <input
              type="text"
              className="border rounded px-2 py-1 w-32"
              placeholder="e.g., clear / faint"
              value={quality}
              onChange={(e) => setQuality(e.target.value)}
            />
          </label>

          <label className="flex items-center gap-2">
            Confidence
            <input
              type="number"
              min={0}
              max={1}
              step="0.01"
              className="border rounded px-2 py-1 w-24"
              value={confidence}
              onChange={(e) => setConfidence(e.target.value === "" ? "" : Number(e.target.value))}
              title="0–1"
            />
          </label>

          <label className="md:col-span-5 flex items-start gap-2">
            Notes
            <textarea
              className="border rounded px-2 py-1 w-full h-16"
              placeholder="Free text…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </div>
        <div className="text-xs text-slate-500">
          These fields apply to the <em>next</em> tag you save.
        </div>
      </div>

      {/* Label buttons */}
      <div className="flex flex-wrap gap-2 items-center text-sm">
        <span className="text-slate-600 mr-2">Tag as:</span>
        {labels.map((l) => (
          <button
            type="button"
            key={l.id}
            className="border px-2 py-1 rounded"
            style={{ background: l.color ?? undefined }}
            onClick={() => saveCurrentSelection(l.id)}
            disabled={saving}
            title={l.hotkey ? `Hotkey: ${l.hotkey}` : ""}
          >
            {l.name}{l.hotkey ? ` [${l.hotkey}]` : ""}
          </button>
        ))}
        {saving && <span className="text-slate-500 ml-2">Saving…</span>}
        {toast && <span className="ml-2 text-green-600">{toast}</span>}
      </div>

      {/* Saved segments table */}
      <div>
        <h2 className="font-medium mb-2">Saved segments</h2>
        {segments.length === 0 ? (
          <div className="text-slate-500 text-sm">No segments yet.</div>
        ) : (
          <table className="w-full text-sm border">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left p-2 border">#</th>
                <th className="text-left p-2 border">ID</th>
                <th className="text-left p-2 border">Start (s)</th>
                <th className="text-left p-2 border">End (s)</th>
                <th className="text-left p-2 border">Label</th>
                <th className="text-left p-2 border">Indiv.</th>
                <th className="text-left p-2 border">Rate</th>
                <th className="text-left p-2 border">Qual.</th>
                <th className="text-left p-2 border">Conf.</th>
                <th className="text-left p-2 border">Notes</th>
                <th className="text-left p-2 border">Actions</th>
              </tr>
            </thead>
           <tbody>
            {segments
              .slice()
              .sort((a, b) => a.startS - b.startS)
              .map((s, i) => {
                const isEditing = editingId === s.id;
                return (
                  <tr
                    key={s.id}
                    data-seg-row={s.id}
                    onMouseEnter={() => highlightRegion(s.id, true)}
                    onMouseLeave={() => highlightRegion(s.id, false)}
                  >
                    <td className="p-2 border w-10 text-right">{i + 1}</td>
                    <td className="p-2 border font-mono text-xs">
                      <button
                        type="button"
                        className="underline"
                        title={s.id}
                        onClick={() => focusRegion(s.id, false)}
                      >
                        …{s.id.slice(-4)}
                      </button>
                    </td>

                    <td className="p-2 border font-mono">{s.startS.toFixed(2)}</td>
                    <td className="p-2 border font-mono">{s.endS.toFixed(2)}</td>
                    <td className="p-2 border">
                      <span
                        className="px-2 py-0.5 rounded"
                        style={{ background: s.label?.color ?? "rgba(34,197,94,0.25)" }}
                      >
                        {s.label?.name ?? s.labelId}
                      </span>
                    </td>

                    {/* Individuals */}
                    <td className="p-2 border text-center">
                      {isEditing ? (
                        <input
                          type="number"
                          min={0}
                          className="border rounded px-2 py-1 w-20 text-right"
                          value={draft.individuals ?? ""}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, individuals: e.target.value === "" ? "" : Number(e.target.value) }))
                          }
                        />
                      ) : (
                        s.individuals ?? "—"
                      )}
                    </td>

                    {/* Rate */}
                    <td className="p-2 border text-center">
                      {isEditing ? (
                        <input
                          type="number"
                          min={0}
                          step="0.1"
                          className="border rounded px-2 py-1 w-24 text-right"
                          value={draft.callingRate ?? ""}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, callingRate: e.target.value === "" ? "" : Number(e.target.value) }))
                          }
                        />
                      ) : s.callingRate != null ? (
                        Number(s.callingRate).toFixed(2)
                      ) : (
                        "—"
                      )}
                    </td>

                    {/* Quality */}
                    <td className="p-2 border">
                      {isEditing ? (
                        <input
                          type="text"
                          className="border rounded px-2 py-1 w-full"
                          value={draft.quality ?? ""}
                          onChange={(e) => setDraft((d) => ({ ...d, quality: e.target.value }))}
                        />
                      ) : (
                        s.quality ?? "—"
                      )}
                    </td>

                    {/* Confidence */}
                    <td className="p-2 border text-center">
                      {isEditing ? (
                        <input
                          type="number"
                          min={0}
                          max={1}
                          step="0.01"
                          className="border rounded px-2 py-1 w-24 text-right"
                          value={draft.confidence ?? ""}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, confidence: e.target.value === "" ? "" : Number(e.target.value) }))
                          }
                        />
                      ) : s.confidence != null ? (
                        Number(s.confidence).toFixed(2)
                      ) : (
                        "—"
                      )}
                    </td>

                    {/* Notes */}
                    <td className="p-2 border max-w-[20ch]" title={s.notes ?? ""}>
                      {isEditing ? (
                        <input
                          type="text"
                          className="border rounded px-2 py-1 w-full"
                          value={draft.notes ?? ""}
                          onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                        />
                      ) : (
                        <span className="truncate inline-block max-w-[20ch]">{s.notes ?? "—"}</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="p-2 border space-x-2 whitespace-nowrap">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            className="border px-2 py-0.5 rounded hover:bg-slate-50"
                            onClick={() => saveEdit(s.id)}
                            disabled={savingEdit}
                          >
                            {savingEdit ? "Saving…" : "Save"}
                          </button>
                          <button
                            type="button"
                            className="border px-2 py-0.5 rounded hover:bg-slate-50"
                            onClick={cancelEdit}
                            disabled={savingEdit}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="border px-2 py-0.5 rounded hover:bg-slate-50"
                            onClick={() => focusRegion(s.id, true)}
                          >
                            Go
                          </button>
                          <button
                            type="button"
                            className="border px-2 py-0.5 rounded hover:bg-slate-50"
                            onClick={() => startEdit(s)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="border px-2 py-0.5 rounded text-red-600 hover:bg-red-50"
                            onClick={() => handleDelete(s.id)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>


          </table>
        )}
      </div>

      <div className="text-xs text-slate-600">
        Shortcuts:
        <kbd className="border px-1 rounded ml-1">[</kbd> start,{" "}
        <kbd className="border px-1 rounded ml-1">]</kbd> end,{" "}
        <kbd className="border px-1 rounded ml-1">Space</kbd> play/pause,{" "}
        <kbd className="border px-1 rounded ml-1">L</kbd> loop, hotkeys:{" "}
        {labels.filter((l) => l.hotkey).map((l) => l!.hotkey).join(", ") || "—"}
      </div>
    </div>
  );
}

function chipEl(text: string, bg: string) {
  const el = document.createElement("span");
  el.textContent = text;
  el.style.padding = "2px 6px";
  el.style.borderRadius = "6px";
  el.style.background = bg;
  el.style.color = "#000";
  el.style.fontSize = "12px";
  el.style.lineHeight = "16px";
  el.style.userSelect = "none";
  el.style.pointerEvents = "none";
  return el;
}

function baseToRgba(hex: string, alpha: number) {
  const shorthand = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  const full = hex.replace(shorthand, (_, r, g, b) => r + r + g + g + b + b);
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(full);
  if (!match) return hex;
  const [, r, g, b] = match;
  return `rgba(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}, ${alpha})`;
}
