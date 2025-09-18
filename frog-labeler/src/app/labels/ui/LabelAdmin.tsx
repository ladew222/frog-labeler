"use client";

import { useEffect, useState } from "react";

type Label = {
  id: string;
  name: string;
  color: string | null;
  hotkey: string | null;
  _count: { segments: number };
};

export default function LabelAdmin() {
  const [labels, setLabels] = useState<Label[]>([]);
  const [newLabel, setNewLabel] = useState({ name: "", color: "", hotkey: "" });
  const [error, setError] = useState<string | null>(null);

  // ⬇️ ingest UI state
  const [busyIngest, setBusyIngest] = useState(false);
  const [ingestErr, setIngestErr] = useState<string | null>(null);
  const [ingestStats, setIngestStats] = useState<{
    created: number;
    updated: number;
    scanned: number;
    bad: string[];
  } | null>(null);

  const fetchLabels = async () => {
    const r = await fetch("/api/labels");
    const data = await r.json();
    setLabels(data);
  };

  useEffect(() => {
    fetchLabels();
  }, []);

  // ⬇️ admin-only ingest call to /api/admin/ingest (POST)
  async function runIngest() {
    setBusyIngest(true);
    setIngestErr(null);
    setIngestStats(null);
    try {
      const res = await fetch("/api/admin/ingest", { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `Ingest failed (${res.status})`);
      }
      const j = await res.json();
      setIngestStats(j.stats);
      // reload labels (new files don’t change labels, but good to keep things fresh)
      fetchLabels();
    } catch (e: any) {
      setIngestErr(e.message || "Ingest failed");
    } finally {
      setBusyIngest(false);
    }
  }

  const createLabel = async () => {
    const r = await fetch("/api/labels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newLabel }),
    });
    if (r.ok) {
      setNewLabel({ name: "", color: "", hotkey: "" });
      fetchLabels();
    } else {
      const d = await r.json();
      setError(d.error || "Failed to create label");
    }
  };

  const deleteLabel = async (id: string) => {
    const label = labels.find((l) => l.id === id);
    if (!label) return;

    if (label._count.segments > 0) {
      const toId = prompt(`Label "${label.name}" is in use.\nEnter the ID of the label to reassign segments to:`);
      if (!toId) return;
      const r = await fetch("/api/labels/reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromId: id, toId }),
      });
      if (r.ok) fetchLabels();
      else alert("Reassignment failed.");
    } else {
      if (confirm(`Delete label "${label.name}"?`)) {
        const r = await fetch(`/api/labels/${id}`, { method: "DELETE" });
        if (r.ok) fetchLabels();
        else alert("Delete failed.");
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Ingest controls */}
      <div className="border rounded p-3 space-y-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={runIngest}
            disabled={busyIngest}
            className="bg-emerald-600 text-white px-3 py-1.5 rounded hover:bg-emerald-700 disabled:opacity-50"
            title="Scan public/audio and upsert .wav files"
          >
            {busyIngest ? "Scanning…" : "Scan & Ingest new audio"}
          </button>
          {ingestErr && <span className="text-red-600 text-sm">{ingestErr}</span>}
        </div>

        {ingestStats && (
          <div className="text-sm text-slate-700">
            <div>Scanned: <b>{ingestStats.scanned}</b></div>
            <div>Created: <b className="text-emerald-700">{ingestStats.created}</b></div>
            <div>Updated: <b className="text-amber-700">{ingestStats.updated}</b></div>
            {ingestStats.bad.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer">Unparsed filenames ({ingestStats.bad.length})</summary>
                <ul className="list-disc pl-5 text-slate-600">
                  {ingestStats.bad.map((f) => <li key={f}>{f}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>

      <div>
        <h2 className="font-medium mb-2">Create new label</h2>
        <div className="flex gap-2">
          <input
            className="border px-2 py-1 rounded"
            placeholder="Name"
            value={newLabel.name}
            onChange={(e) => setNewLabel({ ...newLabel, name: e.target.value })}
          />
          <input
            className="border px-2 py-1 rounded"
            placeholder="Color (hex or rgba)"
            value={newLabel.color}
            onChange={(e) => setNewLabel({ ...newLabel, color: e.target.value })}
          />
          <input
            className="border px-2 py-1 rounded"
            placeholder="Hotkey"
            value={newLabel.hotkey}
            onChange={(e) => setNewLabel({ ...newLabel, hotkey: e.target.value })}
          />
          <button className="border px-3 py-1 rounded bg-green-200" onClick={createLabel}>
            Create
          </button>
        </div>
        {error && <div className="text-red-600 mt-1">{error}</div>}
      </div>

      <div>
        <h2 className="font-medium mb-2">Existing Labels</h2>
        <table className="text-sm border w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-2 border">Name</th>
              <th className="text-left p-2 border">Color</th>
              <th className="text-left p-2 border">Hotkey</th>
              <th className="text-left p-2 border">Used</th>
              <th className="text-left p-2 border">Actions</th>
            </tr>
          </thead>
          <tbody>
            {labels.map((l) => (
              <tr key={l.id}>
                <td className="p-2 border">{l.name}</td>
                <td className="p-2 border">
                  <span style={{ background: l.color ?? "#ccc" }} className="px-2 py-1 rounded inline-block">
                    {l.color}
                  </span>
                </td>
                <td className="p-2 border">{l.hotkey}</td>
                <td className="p-2 border">{l._count.segments}</td>
                <td className="p-2 border">
                  <button
                    className="text-red-600 underline"
                    onClick={() => deleteLabel(l.id)}
                  >
                    {l._count.segments > 0 ? "Reassign & Delete…" : "Delete"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
