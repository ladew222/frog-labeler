"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.esm.js";
import SpectrogramPlugin from "wavesurfer.js/dist/plugins/spectrogram.esm.js";
import Link from "next/link";


type AudioRow = { id: string; originalName: string; uri: string; recordedAt: string | null };
type LabelRow = { id: string; name: string; hotkey: string | null; color?: string | null };
type SegmentRow = {
  id: string;
  audioId: string;
  startS: number;
  endS: number;
  labelId: string;
  label: { id: string; name: string; color: string | null; hotkey: string | null };
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
  const r = await fetch(`/api/segments/${audioId}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`GET /api/segments/${audioId} -> ${r.status}`);
  return r.json();
}

export default function Annotator({ audioId }: { audioId: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const spectroRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null);

  // The dedicated green "pending" region we keep in sync with sliders
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

  // ------- Load metadata -------
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

  // ------- Init WaveSurfer + plugins -------
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
    regionsRef.current = regions;

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
      if (e?.name === "AbortError") return; // ignore teardown aborts
      console.error("WaveSurfer error:", e);
    });

    ws.on("ready", () => {
      const d = ws.getDuration() || 0;
      setDuration(d);
      // initialize selection to first second (visible + valid)
      const start = 0;
      const end = Math.min(1, Math.max(0.05, d));
      setSelStart(start);
      setSelEnd(end);
      syncPendingRegion(start, end);

      // draw existing segments
      for (const s of segments) {
        const base = s.label.color ?? "#22c55e";
        const col =
            base.startsWith("rgba") || base.startsWith("rgb")
            ? base
            : baseToRgba(base, 0.25);

        regions.addRegion({
            start: s.startS,
            end: s.endS,
            color: col,
            content: chipEl(s.label.name, base),
            drag: false,
            resize: false,
        });
        }

    });

    // Keyboard
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        ws.playPause();
        return;
      }
      if (e.key === "[") {
        const t = ws.getCurrentTime();
        const end = Math.max(t + 0.05, selEnd);
        setSelStart(Math.min(t, end - 0.01));
        setSelEnd(end);
        syncPendingRegion(Math.min(t, end - 0.01), end);
        return;
      }
      if (e.key === "]") {
        const t = ws.getCurrentTime();
        const start = Math.min(t, selStart);
        setSelStart(start);
        setSelEnd(Math.max(t, start + 0.05));
        syncPendingRegion(start, Math.max(t, start + 0.05));
        return;
      }
      if (e.key === "l") {
        ws.play(selStart, selEnd);
        return;
      }
      const labelId = hotkeyToLabelId[e.key];
      if (labelId) {
        e.preventDefault();
        void saveCurrentSelection(labelId);
      }
    };

    window.addEventListener("keydown", onKey);

    // Cleanup
    return () => {
      window.removeEventListener("keydown", onKey);
      try {
        // @ts-ignore
        const el: HTMLMediaElement | undefined = ws.getMediaElement?.();
        if (el) {
          el.pause();
          el.src = "";
          el.load();
        }
        ws.unAll();
        setTimeout(() => {
            try {
                // wavesurfer might throw an AbortError — safe to ignore
                ws.destroy();
            } catch (err: any) {
                if (err?.name !== "AbortError") console.error("WaveSurfer destroy error:", err);
            }
        }, 0);

      } catch {}
      wsRef.current = null;
      regionsRef.current = null;
    };
  }, [audio, segments, hotkeyToLabelId]); // sliders not deps here—handled below
  // keep a single pending region instance
const pendingRegionRef = useRef<any>(null);


function syncPendingRegion(start: number, end: number) {
  const regions = regionsRef.current;
  if (!regions) return;

  const minLen = 0.02;
  const s = Math.max(0, Math.min(start, end - minLen));
  const e = Math.max(s + minLen, end);

  const el = chipEl("pending", "rgba(34,197,94,0.5)");

  // update existing pending if we have it
  const r = pendingRegionRef.current;
  if (r && typeof r.update === "function") {
    r.update({
      start: s,
      end: e,
      color: "rgba(34,197,94,0.28)",
      content: el,            // ← use element, not HTML string
      drag: true,
      resize: true,
    });
    return;
  }

  // otherwise ensure no stray pending regions exist, then create one
  regions.getRegions().forEach((rg: any) => {
    if (rg.id === pendingId) rg.remove();
  });

  const created = regions.addRegion({
    id: pendingId,
    start: s,
    end: e,
    color: "rgba(34,197,94,0.28)",
    content: el,              // ← use element
    drag: true,
    resize: true,
  });

  pendingRegionRef.current = created;
}

function clearPending() {
  if (pendingRegionRef.current) {
    try { pendingRegionRef.current.remove(); } catch {}
  }
  pendingRegionRef.current = null;
  setSelStart((s) => s); // no-op; leave sliders as-is
  setSelEnd((e) => e);
}




  // update region when sliders change
  useEffect(() => {
    if (duration > 0) syncPendingRegion(selStart, selEnd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selStart, selEnd, duration]);

  // ------- Save selection -------
    async function saveCurrentSelection(labelId: string) {
    if (!audio) return;
    const start = Math.max(0, selStart);
    const end = Math.min(duration || selEnd, selEnd);
    if (!(end > start)) return;

    setSaving(true);
    try {
        const res = await fetch("/api/segments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioId: audio.id, startS: start, endS: end, labelId }),
        });
        if (!res.ok) throw new Error(`POST /api/segments -> ${res.status}`);
        const saved: SegmentRow = await res.json();

        // Draw final region (locked, semi‑transparent)
        const base = labelById[labelId]?.color ?? "#22c55e";
        const col =
        base.startsWith("rgba") || base.startsWith("rgb")
            ? base
            : baseToRgba(base, 0.25);

        regionsRef.current?.addRegion({
        start,
        end,
        color: col,
        content: chipEl(labelById[labelId]?.name ?? "label", base),
        drag: false,
        resize: false,
        });

        clearPending();
        setSegments((prev) => [...prev, { ...saved, label: { ...labelById[labelId] } as any }]);
        setToast("Saved ✓");
        setTimeout(() => setToast(null), 1000);
    } catch (e) {
        console.error(e);
        setToast("Save failed");
        setTimeout(() => setToast(null), 1200);
    } finally {
        setSaving(false);
    }
    }

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

      {/* Selection controls (sliders) */}
      <div className="text-sm border rounded p-3 space-y-2">
        <div className="flex items-center gap-3">
          <button type="button" className="border px-2 py-1 rounded" onClick={() => wsRef.current?.playPause()}>
            ▶/⏸
          </button>
          <button
            type="button"
            className="border px-2 py-1 rounded"
            onClick={() => wsRef.current?.play(selStart, selEnd)}
          >
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
              type="range"
              min={0}
              max={Math.max(0.01, duration)}
              step={0.01}
              value={selStart}
              onChange={(e) => {
                const v = Math.min(parseFloat(e.target.value), selEnd - 0.01);
                setSelStart(Math.max(0, v));
              }}
              className="w-full"
            />
            <code>{fmt(selStart)}</code>
            <button
              type="button"
              className="border px-1 py-0.5 rounded"
              title="Set from playhead ["
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
              type="range"
              min={0}
              max={Math.max(0.01, duration)}
              step={0.01}
              value={selEnd}
              onChange={(e) => {
                const v = Math.max(parseFloat(e.target.value), selStart + 0.01);
                setSelEnd(Math.min(duration || v, v));
              }}
              className="w-full"
            />
            <code>{fmt(selEnd)}</code>
            <button
              type="button"
              className="border px-1 py-0.5 rounded"
              title="Set from playhead ]"
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
                <th className="text-left p-2 border">Start (s)</th>
                <th className="text-left p-2 border">End (s)</th>
                <th className="text-left p-2 border">Label</th>
              </tr>
            </thead>
            <tbody>
              {segments
                .sort((a, b) => a.startS - b.startS)
                .map((s) => (
                  <tr key={s.id}>
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
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="text-xs text-slate-600">
        Shortcuts:
        <kbd className="border px-1 rounded ml-1">[</kbd> start from playhead,
        <kbd className="border px-1 rounded ml-1">]</kbd> end from playhead,
        <kbd className="border px-1 rounded ml-1">Space</kbd> play/pause,
        <kbd className="border px-1 rounded ml-1">L</kbd> loop selection,
        label hotkeys: {labels.filter((l) => l.hotkey).map((l) => l!.hotkey).join(", ") || "—"}
      </div>
    </div>
  );
}
function chipEl(text: string, bg: string) {
  const el = document.createElement("span");
  el.textContent = text;                 // safe text (no HTML)
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