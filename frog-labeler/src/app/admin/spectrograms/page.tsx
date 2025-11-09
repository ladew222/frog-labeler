"use client";

import { useEffect, useState } from "react";

type FolderEntry = { name: string; fullPath: string };

type ProgressInfo = Record<
  string,
  {
    total: number;
    done: number;
    started: boolean;
    finished: boolean;
    errors: number;
  }
>;

export default function SpectrogramBatchAdmin() {
  const [folders, setFolders] = useState<FolderEntry[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [progress, setProgress] = useState<ProgressInfo>({});
  const [busy, setBusy] = useState(false);

  /** ---------------- Fetch folder list ---------------- */
  useEffect(() => {
    fetch("/api/admin/spectrograms/folders")
      .then((r) => r.json())
      .then((data) => setFolders(data))
      .catch(console.error);
  }, []);

  /** ---------------- Poll progress every 3s ---------------- */
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/admin/spectrograms/status");
        if (!res.ok) return;
        const data = await res.json();
        setProgress(data);
      } catch (e) {
        console.error("Polling error:", e);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  /** ---------------- Run batch process ---------------- */
  async function runBatch() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/spectrograms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folders: selected }),
      });
      const data = await res.json();
      console.log("Batch started:", data);
    } catch (err) {
      console.error("Batch error:", err);
    } finally {
      setBusy(false);
    }
  }

  /** ---------------- Toggle folder selection ---------------- */
  function toggle(folder: string) {
    setSelected((prev) =>
      prev.includes(folder)
        ? prev.filter((f) => f !== folder)
        : [...prev, folder]
    );
  }

  /** ---------------- Render ---------------- */
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-xl font-semibold">Spectrogram Batch Generator</h1>
      <p className="text-slate-600 text-sm">
        Select one or more audio folders to pre-generate spectrograms in the background.
      </p>

      <div className="border rounded p-3 bg-slate-50 max-h-64 overflow-auto">
        {folders.map((f) => {
          const p = progress[f.name];
          const pct = p ? Math.round((p.done / p.total) * 100) : 0;

          return (
            <div key={f.name} className="mb-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.includes(f.name)}
                  onChange={() => toggle(f.name)}
                  disabled={busy}
                />
                <span>{f.name}</span>
              </label>

              {p && (
                <>
                  <div className="w-full bg-gray-200 h-2 rounded mt-1">
                    <div
                      className={`h-2 rounded ${
                        p.finished ? "bg-emerald-600" : "bg-blue-500"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    {p.done}/{p.total} done{" "}
                    {p.errors ? `(${p.errors} errors)` : ""}
                    {p.finished ? " ✅" : ""}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={runBatch}
        disabled={busy || selected.length === 0}
        className="border rounded px-3 py-1 bg-emerald-600 text-white disabled:opacity-50"
      >
        {busy ? "Starting..." : "Generate Spectrograms"}
      </button>
    </div>
  );
}
