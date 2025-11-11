"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";



/** ---------------- Types ---------------- */
type AudioRow = {
  id: string;
  originalName: string;
  uri: string;               // e.g., /audio/…wav  (Range-enabled)
  recordedAt: string | null;
  projectId: string;
};

type LabelRow = {
  id: string;
  name: string;
  hotkey: string | null;
  color?: string | null;
};

const toNum = (v: number | "") =>
  v === "" || Number.isNaN(Number(v)) ? undefined : Number(v);

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
  createdAt?: string;
  createdBy?: { id: string; name: string | null; email: string | null } | null;
  updatedAt?: string | null;
  updatedBy?: { id: string; name: string | null; email: string | null } | null;
};

/** ---------------- API helpers (unchanged) ---------------- */
async function fetchAudio(id: string): Promise<AudioRow> {
  const r = await fetch(`/api/audio/${id}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`GET /api/audio/${id} -> ${r.status}`);
  return r.json();
}
async function fetchLabels(projectId: string): Promise<LabelRow[]> {
  const r = await fetch(`/api/labels?projectId=${encodeURIComponent(projectId)}`, {
    cache: "no-store",
  });
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
function screenToSpectroX(
  e: React.MouseEvent<HTMLDivElement>,
  containerRef: React.RefObject<HTMLDivElement>,
  zoom: number
): number {
  const inner = containerRef.current;
  if (!inner) return 0;

  const sc = inner.parentElement as HTMLElement;
  if (!sc) return 0;

  const rect = inner.getBoundingClientRect();
  const scrollLeft = sc.scrollLeft;
  const xDisplay = e.clientX - rect.left + scrollLeft;

  // Convert to intrinsic coordinate space (unscaled image)
  const xIntrinsic = xDisplay / zoom;

  return Math.max(0, xIntrinsic);
}






/** ---------------- Component ---------------- */
export default function Annotator({ audioId }: { audioId: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null); // inner zoomed spectrogram
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Canvas references
const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const rAF = useRef<number | null>(null);

  const [audio, setAudio] = useState<AudioRow | null>(null);
  const [labels, setLabels] = useState<LabelRow[]>([]);
  const [segments, setSegments] = useState<SegmentRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [spectrogramPath, setSpectrogramPath] = useState<string | null>(null);
  const [selStart, setSelStart] = useState<number>(0);
  const [selEnd, setSelEnd] = useState<number>(0);
  // after const [selEnd, setSelEnd] = useState<number>(0);
  const [debugClickX, setDebugClickX] = useState<number | null>(null);


  const [dragPxStart, setDragPxStart] = useState<number | null>(null);
  const [dragPxEnd, setDragPxEnd] = useState<number | null>(null);

  const [zoom, setZoom] = useState(1);
  const [displayWidth, setDisplayWidth] = useState<number>(0);
  // 👇 Add this line
  const [timeOffset, setTimeOffset] = useState(.25);

  // ... rest of your state unchanged ...
  useEffect(() => {
  console.log("🔍 Zoom changed →", zoom);
}, [zoom]);
useEffect(() => {
  console.log("🎚️ Current time offset:", timeOffset);
}, [timeOffset]);


useEffect(() => {
  if (!displayWidth || !duration) return;
  console.log(`🧮 displayWidth=${displayWidth}px → ${displayPxPerSecond.toFixed(2)} px/sec`);
}, [displayWidth, duration]);



useEffect(() => {
  const container = containerRef.current;
  if (!container) return;

  const observer = new ResizeObserver(entries => {
    for (const entry of entries) {
      setDisplayWidth(entry.contentRect.width);
    }
  });
  observer.observe(container);

  // Cleanup on unmount
  return () => observer.disconnect();
}, []);




  /** Optional fields for the *next* tag */
  const [individuals, setIndividuals] = useState<number | "">("");
  const [callingRate, setCallingRate] = useState<number | "">("");
  const [quality, setQuality] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [confidence, setConfidence] = useState<number | "">("");

  /** Editing row state */
  const [editingId, setEditingId] = useState<string | null>(null);
  type Draft = {
    labelId?: string;
    individuals?: number | "";
    callingRate?: number | "";
    quality?: string;
    notes?: string;
    confidence?: number | "";
  };
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [toast, setToast] = useState<string | null>(null);



  /** ------- Load audio + labels + segs, set spectrogram URL ------- */
  useEffect(() => {
    (async () => {
      try {
        const a = await fetchAudio(audioId);
        const [ls, segs] = await Promise.all([
          fetchLabels(a.projectId),
          fetchSegments(audioId),
        ]);
        setAudio(a);
        setLabels(ls);
        setSegments(segs);
        setSpectrogramPath(`/api/spectrogram?uri=${encodeURIComponent(a.uri)}`);
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load");
        console.error(e);
      }
    })();
  }, [audioId]);

  /** ------- Build label maps for hotkeys etc. ------- */
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

  /** ------- Wire up <audio> element ------- */
  useEffect(() => {
    const el = audioRef.current;
    if (!audio || !el) return;

    el.src = audio.uri;
    const onLoaded = () => {
      setDuration(el.duration || 0);
      // default 1-second selection at start
      const end = Math.min(1, Math.max(0.05, el.duration || 1));
      setSelStart(0);
      setSelEnd(end);
    };
    const onTime = () => setCurrentTime(el.currentTime);

    el.addEventListener("loadedmetadata", onLoaded);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("seeking", onTime);
    el.addEventListener("seeked", onTime);

    // RAF keeps the playhead bar super smooth while playing
    const tick = () => {
      setCurrentTime(el.currentTime);
      rAF.current = requestAnimationFrame(tick);
    };
    const onPlay = () => (rAF.current = requestAnimationFrame(tick));
    const onPause = () => {
      if (rAF.current) cancelAnimationFrame(rAF.current);
      rAF.current = null;
    };
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);

    return () => {
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("seeking", onTime);
      el.removeEventListener("seeked", onTime);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      if (rAF.current) cancelAnimationFrame(rAF.current);
      rAF.current = null;
    };
  }, [audio]);

  /** ------- Pixel <-> time helpers ------- */
// === Use native spectrogram width, not PX_PER_SEC ===

const spectrogramCanvasRef = useRef<HTMLCanvasElement | null>(null);
const [spectrogramImage, setSpectrogramImage] = useState<HTMLImageElement | null>(null);
// Use image's intrinsic width and transform zoom consistently
const naturalWidth = spectrogramImage?.naturalWidth ?? 1;

// The actual *displayed* width, after scaling, equals image width * zoom
const displayedWidth = naturalWidth * zoom;

// Each pixel in the *unscaled* image represents this many seconds:
const secondsPerPixel = duration / naturalWidth;

// Convert between time and intrinsic (unscaled) image pixel coordinates
const timeToX = (t: number) => t / secondsPerPixel;
const xToTime = (x: number) => x * secondsPerPixel;

// Map from seconds → display pixels (on-screen)
const displayPxPerSecond = duration > 0 && displayWidth > 0 ? displayWidth / duration : 0.0001;



// Convert between time (seconds) and *actual displayed* pixels
// Each pixel in the *displayed (zoomed)* image corresponds to this many seconds:
function timeToDisplayX(t: number): number {
  // convert seconds → pixel position in the zoomed image
  return (t / duration) * (naturalWidth * zoom);
}

function displayXToTime(x: number): number {
  // convert pixel position in the zoomed image → seconds
  return (x / (naturalWidth * zoom)) * duration;
}



/** ---------- Canvas Drawing ---------- */

const naturalHeight = spectrogramImage?.naturalHeight ?? 192;



// Load the spectrogram image once
/** ------- Load spectrogram image after audio duration is known ------- */
useEffect(() => {
  if (!spectrogramPath || duration === 0) return;
  console.log("🖼️ Loading spectrogram:", spectrogramPath);

  const img = new Image();
 img.crossOrigin = "anonymous"; // handles local + deployed CORS
img.onload = () => {
  console.log("✅ Spectrogram loaded OK", img.src);
  console.log("⏱ Audio duration:", duration, "s");
  console.log("🖼 Spectrogram width:", img.naturalWidth, "px");
  console.log("=> secondsPerPixel =", duration / img.naturalWidth);

  setSpectrogramImage(img);
};
img.onerror = () => {
  console.error("❌ Failed to load spectrogram image:", img.src);
};

img.crossOrigin = "anonymous"; // handles local + deployed CORS
img.onload = () => {
  console.log("✅ Spectrogram loaded OK", img.src);
  setSpectrogramImage(img);
};


  img.crossOrigin = "anonymous"; // handles local + deployed CORS
  img.onerror = () => {
    console.error("❌ Failed to load spectrogram image:", img.src);
  };
  img.src = `${spectrogramPath}&t=${Date.now()}`; // cache-bust

}, [spectrogramPath, duration]);

/** ------- Redraw spectrogram on zoom or when image/duration ready ------- */
/** ------- Redraw spectrogram on zoom or when image/duration ready ------- */
/** ------- Draw spectrogram at native size ------- */
useEffect(() => {
  if (!spectrogramImage || !duration || !isFinite(duration)) return;

  const canvas = spectrogramCanvasRef.current;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { naturalWidth, naturalHeight } = spectrogramImage;

  // Use native image dimensions — do NOT upscale
  canvas.width = naturalWidth;
  canvas.height = naturalHeight;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(spectrogramImage, 0, 0);

  console.log(`🎨 Drawn at native width ${naturalWidth}`);

  // Tell overlays to use this width instead of PX_PER_SEC
  // (you’ll use this when converting time <-> x)
}, [spectrogramImage]);

// --- Draw playhead whenever currentTime changes ---
// --- Smooth playhead drawing loop ---
useEffect(() => {
  const canvas = spectrogramCanvasRef.current;
  const ctx = canvas?.getContext("2d");
  const el = audioRef.current;
  if (!canvas || !ctx || !spectrogramImage || !duration || !el) return;

  const { naturalWidth, naturalHeight } = spectrogramImage;
  const secondsPerPixel = duration / naturalWidth;
  let frameId: number;

  const draw = () => {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(spectrogramImage, 0, 0);

    // ✅ Now includes updated offset
    const x = (el.currentTime + timeOffset) / secondsPerPixel;

    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, naturalHeight);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2;
    ctx.stroke();

    frameId = requestAnimationFrame(draw);
  };

  const onPlay = () => {
    frameId = requestAnimationFrame(draw);
  };
  const onPause = () => cancelAnimationFrame(frameId);

  el.addEventListener("play", onPlay);
  el.addEventListener("pause", onPause);
  if (!el.paused) frameId = requestAnimationFrame(draw);

  return () => {
    el.removeEventListener("play", onPlay);
    el.removeEventListener("pause", onPause);
    cancelAnimationFrame(frameId);
  };
}, [spectrogramImage, duration, timeOffset]); // 👈 ADD timeOffset here



// --- Auto-scroll as playhead moves ---
// --- Auto-scroll as playhead moves (keep playhead at start of view) ---
useEffect(() => {
  const container = containerRef.current?.parentElement;
  if (!container || !spectrogramImage || !duration) return;

  const { naturalWidth } = spectrogramImage;
  const pxPerSec = (naturalWidth * zoom) / duration;
  const visibleWidth = container.clientWidth;

  let frameId: number;

  const updateScroll = () => {
    const playheadX = (audioRef.current?.currentTime ?? 0) * pxPerSec;
    const scrollLeft = container.scrollLeft;

    // If playhead moves beyond the right edge → advance so it’s near left edge
    if (playheadX > scrollLeft + visibleWidth - 50) {
      container.scrollTo({
        left: playheadX - 20,  // small padding before the playhead
        behavior: "smooth",
      });
    }

    // Optional: if user scrubs backward, bring playhead into view again
    if (playheadX < scrollLeft + 20) {
      container.scrollTo({
        left: Math.max(0, playheadX - 20),
        behavior: "smooth",
      });
    }

    frameId = requestAnimationFrame(updateScroll);
  };

  frameId = requestAnimationFrame(updateScroll);
  return () => cancelAnimationFrame(frameId);
}, [spectrogramImage, zoom, duration]);





// fallback message if image not yet loaded
if (!spectrogramImage && spectrogramCanvasRef.current) {
  const ctx = spectrogramCanvasRef.current.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, spectrogramCanvasRef.current.width, spectrogramCanvasRef.current.height);
    ctx.fillStyle = "#ccc";
    ctx.fillText("Loading spectrogram...", 10, 20);
  }
}



/** ------- Mouse interactions on spectrogram ------- */
const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
  const x = screenToSpectroX(e, containerRef, zoom);
  setDebugClickX(x);   // highlight where code thinks you clicked
  setDragPxStart(x);
  setDragPxEnd(x);
};


const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
  if (dragPxStart == null) return;
  const x = screenToSpectroX(e, containerRef, zoom);
  setDragPxEnd(x);
};


const onMouseUp = () => {
  if (dragPxStart == null || dragPxEnd == null) {
    setDragPxStart(null);
    setDragPxEnd(null);
    return;
  }

  // Convert from intrinsic pixels → seconds
  const startIntrinsic = Math.min(dragPxStart, dragPxEnd);
  const endIntrinsic = Math.max(dragPxStart, dragPxEnd);

  const secondsPerPixel = duration / naturalWidth;

  const tS = startIntrinsic * secondsPerPixel;
  const tE = Math.max(tS + 0.02, endIntrinsic * secondsPerPixel);

  setSelStart(tS);
  setSelEnd(Math.min(duration, tE));
  setDragPxStart(null);
  setDragPxEnd(null);

  console.log("🖱️ Selection →", { startIntrinsic, endIntrinsic, tS, tE, zoom });
};



  /** ------- Keyboard shortcuts ------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = audioRef.current;
      if (!el) return;

      if (e.code === "Space") {
        e.preventDefault();
        if (el.paused) el.play().catch(() => {});
        else el.pause();
        return;
      }
      if (e.key === "l") {
        // loop current selection
        const start = Math.max(0, selStart);
        const end = Math.min(duration || selEnd, selEnd);
        if (end > start) {
          el.currentTime = start;
          el.play().catch(() => {});
          const watcher = () => {
            if (el.currentTime >= end) el.currentTime = start;
            if (!el.paused) requestAnimationFrame(watcher);
          };
          requestAnimationFrame(watcher);
        }
        return;
      }
      if (e.key === "[") {
        const t = el.currentTime ?? selStart;
        const v = Math.min(t, selEnd - 0.01);
        setSelStart(Math.max(0, v));
        return;
      }
      if (e.key === "]") {
        const t = el.currentTime ?? selEnd;
        const v = Math.max(t, selStart + 0.01);
        setSelEnd(Math.min(duration || v, v));
        return;
      }
      const labelId = hotkeyToLabelId[e.key];
      if (labelId) {
        e.preventDefault();
        void saveCurrentSelection(labelId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [duration, selStart, selEnd, hotkeyToLabelId]);




  /** ------- Save, Edit, Delete ------- */
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
          individuals: toNum(individuals),
          callingRate: toNum(callingRate),
          quality: quality.trim() ? quality.trim() : undefined,
          notes: notes.trim() ? notes.trim() : undefined,
          confidence: toNum(confidence),
        }),
      });
      if (!res.ok) throw new Error(`POST /api/audio/${audio.id}/segments -> ${res.status}`);
      const saved: SegmentRow = await res.json();

      // add to table (label object included)
      setSegments((prev) => [...prev, { ...saved, label: labelById[labelId] }]);

      setToast("Saved ✓");
      setTimeout(() => setToast(null), 1000);

      // reset optional inputs after save
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

  const handleDelete = useCallback(async (segmentId: string) => {
    if (!confirm("Delete this segment?")) return;
    try {
      const res = await fetch(`/api/segments/${segmentId}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204)
        throw new Error(`DELETE /api/segments/${segmentId} -> ${res.status}`);
      setSegments((prev) => prev.filter((s) => s.id !== segmentId));
    } catch (e) {
      console.error(e);
      alert("Failed to delete segment");
    }
  }, []);

  function startEdit(s: SegmentRow) {
    setEditingId(s.id);
    setDraft({
      labelId: s.labelId,
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
  async function saveEdit(segmentId: string) {
    setSavingEdit(true);
    try {
      const nextLabelId = draft.labelId;
      const payload: Partial<SegmentRow> = {
        individuals: toNum(draft.individuals ?? ""),
        callingRate: toNum(draft.callingRate ?? ""),
        quality: (draft.quality ?? "").trim() || null,
        notes: (draft.notes ?? "").trim() || null,
        confidence: toNum(draft.confidence ?? ""),
        ...(nextLabelId ? { labelId: nextLabelId } : {}),
      };
      const updated = await updateSegment(segmentId, payload);

      setSegments((prev) =>
        prev.map((s) => {
          if (s.id !== segmentId) return s;
          const newLabelId = nextLabelId ?? s.labelId;
          const newLabelObj = labelById[newLabelId] ?? s.label;
          return { ...s, ...updated, labelId: newLabelId, label: newLabelObj };
        })
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

  /** ------- Helpers ------- */
  const fmt = (x?: number | null) => (x == null ? "—" : x.toFixed(2));
  const shortId = (id: string) => id.slice(-4);
  const baseToRgba = (hex: string, alpha: number) => {
    const shorthand = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    const full = hex.replace(shorthand, (_, r, g, b) => r + r + g + g + b + b);
    const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(full);
    if (!match) return hex;
    const [, r, g, b] = match;
    return `rgba(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}, ${alpha})`;
  };

  /** ------- Focus a region from table click ------- */
  function focusRegion(segId: string, play = false) {
    const seg = segments.find((s) => s.id === segId);
    const el = audioRef.current;
    if (!seg || !el) return;
    const mid = seg.startS + Math.min(0.05, Math.max(0, seg.endS - seg.startS) / 2);
    el.currentTime = mid;
    if (play) el.play().catch(() => {});
    // flash overlay rectangle
    const dom = document.querySelector<HTMLElement>(`[data-seg-box="${segId}"]`);
    if (dom) {
      dom.classList.add("ring-2", "ring-amber-400");
      setTimeout(() => dom.classList.remove("ring-2", "ring-amber-400"), 600);
    }
    const row = document.querySelector<HTMLTableRowElement>(`[data-seg-row="${segId}"]`);
    row?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  /** ------- Hover highlight hooks on table rows ------- */
  function highlightRegion(segId: string, on: boolean) {
    const dom = document.querySelector<HTMLElement>(`[data-seg-box="${segId}"]`);
    if (!dom) return;
    if (on) dom.classList.add("ring-2", "ring-sky-400");
    else dom.classList.remove("ring-2", "ring-sky-400");
  }

  /** ------- Render ------- */
  if (err) return <div className="p-6 text-red-600">Error: {err}</div>;
  if (!audio) return <div className="p-6">Loading…</div>;

  // computed selection overlay from drag (live preview)
  const dragLeft = dragPxStart != null && dragPxEnd != null ? Math.min(dragPxStart, dragPxEnd) : null;
  const dragWidth = dragPxStart != null && dragPxEnd != null ? Math.abs(dragPxEnd - dragPxStart) : null;

  return (
    <div className="p-6 space-y-4">
      <Link href="/" className="inline-block text-blue-600 underline hover:text-blue-800 text-sm">
        ← Back to file list
      </Link>

      <h1 className="text-xl font-semibold">
        Annotate: <span className="font-mono">{audio.originalName}</span>
      </h1>

      {/* Spectrogram + overlay */}
  {/* Zoom controls */}
<div className="flex items-center gap-3 text-sm">
  <label>Zoom:</label>
  <input
    type="range"
    min={1}
    max={10}
    step={0.1}
    value={zoom}
    onChange={(e) => setZoom(parseFloat(e.target.value))}
    className="w-48"
  />
  <span>{zoom.toFixed(1)}×</span>
</div>
{/* Offset tuning control */}
<div className="flex items-center gap-3 text-sm">
  <label>Sync Offset:</label>
  <input
    type="range"
    min={-4}
    max={4}
    step={0.01}
    value={timeOffset}
    onChange={(e) => setTimeOffset(parseFloat(e.target.value))}
    className="w-64"
  />
  <span>{timeOffset.toFixed(2)} s</span>
  <span className="text-slate-500 text-xs">(negative = earlier, positive = later)</span>
</div>

{/* === Canvas-based spectrogram === */}
<div className="relative border rounded overflow-x-auto bg-black" style={{ height: "12rem" }}>
<div
  ref={containerRef}
  className="relative h-full"
  style={{
  width: `${naturalWidth * zoom}px`,   // actual layout width scales with zoom
  minWidth: "100%",
  cursor: dragPxStart != null ? "crosshair" : "default",
}}


  onMouseDown={onMouseDown}
  onMouseMove={onMouseMove}
  onMouseUp={onMouseUp}
  onMouseLeave={() => {
    if (dragPxStart != null) {
      console.warn("⚠️ Mouse left area during drag — cancelling");
      setDragPxStart(null);
      setDragPxEnd(null);
    }
  }}
>

 <canvas
  ref={spectrogramCanvasRef}
  width={naturalWidth}
  height={naturalHeight}
  style={{ width: "100%", height: "100%", display: "block" }}
/>
{debugClickX != null && (
  <div
    className="absolute top-0 bottom-0 w-[2px] bg-red-500 pointer-events-none"
    style={{
      left: `${timeToDisplayX(selStart) - (containerRef.current?.parentElement?.scrollLeft ?? 0)}px`,
      zIndex: 10,
    }}
  />
)}




    {/* Existing tagged segments */}
    {segments.map((s) => {
      const color = s.label?.color ?? "#22c55e";
      return (
        <div
          key={s.id}
          data-seg-box={s.id}
          className="absolute top-0 bottom-0 border-x-2 pointer-events-none opacity-50"
          style={{
            left: `${timeToDisplayX(s.startS) - (containerRef.current?.parentElement?.scrollLeft ?? 0)}px`,
            width: `${(timeToX(s.endS) - timeToX(s.startS)) * zoom}px`,
            background: baseToRgba(color, 0.25),
            borderColor: color,
            zIndex: 3,
          }}

          title={`${s.label?.name ?? "Unknown"}: ${fmt(s.startS)}–${fmt(s.endS)}s`}
        />
      );
    })}

    {/* Selection overlay */}
    {duration > 0 && selEnd > selStart && dragPxStart == null && (
  <div
    className="absolute top-0 bottom-0 bg-green-500/25 border-x border-green-400 pointer-events-none"
    style={{
      left: `${timeToDisplayX(selStart) - (containerRef.current?.parentElement?.scrollLeft ?? 0)}px`,
      width: `${timeToDisplayX(selEnd) - timeToDisplayX(selStart)}px`,
      zIndex: 5,
    }}
  />
)}


    {/* Drag overlay */}
    {dragPxStart != null && dragPxEnd != null && (
      <div
        className="absolute top-0 bottom-0 bg-blue-500/30 border-x border-blue-400 pointer-events-none"
        style={{
          left: `${Math.min(dragPxStart, dragPxEnd) * zoom - (containerRef.current?.parentElement?.scrollLeft ?? 0)}px`,
          width: `${Math.abs(dragPxEnd - dragPxStart) * zoom}px`,
          zIndex: 6,
        }}
      />
    )}


    {/* Playhead */}
    <div
      className="absolute top-0 bottom-0 w-[2px] bg-white/80 pointer-events-none"
      style={{
        left: `${timeToDisplayX(selStart) - (containerRef.current?.parentElement?.scrollLeft ?? 0)}px`,
        zIndex: 7,
      }}
    />
  </div>
</div>



      {/* Player controls */}
      <audio ref={audioRef} className="w-full" controls />

      {/* Selection info + actions */}
      <div className="text-sm border rounded p-3">
        <button
          onClick={() => {
            const el = audioRef.current;
            if (!el) return;
            if (el.paused) el.play().catch(() => {});
            else el.pause();
          }}
          className="border px-2 py-1 rounded mr-2"
        >
          ▶/⏸
        </button>
        <button
          onClick={() => {
            const el = audioRef.current;
            if (!el) return;
            const start = Math.max(0, selStart);
            const end = Math.min(duration || selEnd, selEnd);
            if (!(end > start)) return;
            el.currentTime = start;
            el.play().catch(() => {});
            const loop = () => {
              if (el.currentTime >= end) el.currentTime = start;
              if (!el.paused) requestAnimationFrame(loop);
            };
            requestAnimationFrame(loop);
          }}
          className="border px-2 py-1 rounded"
        >
          Loop sel
        </button>
        <span className="ml-3 text-slate-600">
          Selection: <code>{fmt(selStart)}</code> → <code>{fmt(selEnd)}</code> /{" "}
          <code>{fmt(duration)}</code> s
        </span>
      </div>

      {/* Sliders for fine control */}
      <div className="text-sm border rounded p-3 space-y-2">
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
                const t = audioRef.current?.currentTime ?? selStart;
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
                const t = audioRef.current?.currentTime ?? selEnd;
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
            key={l.id}
            className="border px-2 py-1 rounded"
            style={{ background: l.color ?? undefined }}
            onClick={() => saveCurrentSelection(l.id)}
            disabled={saving}
            title={l.hotkey ? `Hotkey: ${l.hotkey}` : ""}
          >
            {l.name}
            {l.hotkey ? ` [${l.hotkey}]` : ""}
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
                <th className="text-left p-2 border">By</th>
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
                        {isEditing ? (
                          <select
                            className="border rounded px-2 py-1 w-full"
                            value={draft.labelId ?? s.labelId}
                            onChange={(e) => setDraft((d) => ({ ...d, labelId: e.target.value }))}
                          >
                            {labels.map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span
                            className="px-2 py-0.5 rounded"
                            style={{ background: s.label?.color ?? "rgba(34,197,94,0.25)" }}
                          >
                            {s.label?.name ?? s.labelId}
                          </span>
                        )}
                      </td>
                      <td className="p-2 border">
                        {s.updatedBy?.name ||
                          s.updatedBy?.email ||
                          s.createdBy?.name ||
                          s.createdBy?.email ||
                          "—"}
                      </td>

                      <td className="p-2 border text-center">
                        {isEditing ? (
                          <input
                            type="number"
                            min={0}
                            className="border rounded px-2 py-1 w-20 text-right"
                            value={draft.individuals ?? ""}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                individuals: e.target.value === "" ? "" : Number(e.target.value),
                              }))
                            }
                          />
                        ) : (
                          s.individuals ?? "—"
                        )}
                      </td>

                      <td className="p-2 border text-center">
                        {isEditing ? (
                          <input
                            type="number"
                            min={0}
                            step="0.1"
                            className="border rounded px-2 py-1 w-24 text-right"
                            value={draft.callingRate ?? ""}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                callingRate:
                                  e.target.value === "" ? "" : Number(e.target.value),
                              }))
                            }
                          />
                        ) : s.callingRate != null ? (
                          Number(s.callingRate).toFixed(2)
                        ) : (
                          "—"
                        )}
                      </td>

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
                              setDraft((d) => ({
                                ...d,
                                confidence:
                                  e.target.value === "" ? "" : Number(e.target.value),
                              }))
                            }
                          />
                        ) : s.confidence != null ? (
                          Number(s.confidence).toFixed(2)
                        ) : (
                          "—"
                        )}
                      </td>

                      <td className="p-2 border max-w-[20ch]" title={s.notes ?? ""}>
                        {isEditing ? (
                          <input
                            type="text"
                            className="border rounded px-2 py-1 w-full"
                            value={draft.notes ?? ""}
                            onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                          />
                        ) : (
                          <span className="truncate inline-block max-w-[20ch]">
                            {s.notes ?? "—"}
                          </span>
                        )}
                      </td>

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
