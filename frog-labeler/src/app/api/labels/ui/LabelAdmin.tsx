"use client";

import { useEffect, useMemo, useState } from "react";

type Label = {
  id: string;
  name: string;
  color: string | null;
  hotkey: string | null;
  _count?: { segments: number }; // from API include
};

export default function LabelAdmin() {
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // create form
  const [form, setForm] = useState({ name: "", color: "#22c55e", hotkey: "" });

  // reassign dialog state
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignFrom, setReassignFrom] = useState<Label | null>(null);
  const [reassignToId, setReassignToId] = useState<string>("");

  const labelOptions = useMemo(
    () => labels.map(l => ({ id: l.id, name: l.name })),
    [labels]
  );

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/labels", { cache: "no-store" });
      if (!r.ok) throw new Error(`GET /api/labels -> ${r.status}`);
      const data: Label[] = await r.json();
      setLabels(data);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createLabel() {
    if (!form.name.trim()) return;
    const payload = {
      name: form.name.trim(),
      color: form.color,
      hotkey: form.hotkey.trim() ? form.hotkey.trim()[0] : null,
    };
    const r = await fetch("/api/labels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      alert("Create failed");
      return;
    }
    setForm({ name: "", color: "#22c55e", hotkey: "" });
    await load();
  }

  async function updateLabel(id: string, patch: Partial<Label>) {
    const r = await fetch(`/api/labels/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!r.ok) {
      alert("Update failed");
      return;
    }
    await load();
  }

  async function directDelete(id: string) {
    const r = await fetch(`/api/labels/${id}`, { method: "DELETE" });
    if (!r.ok) {
      const t = await r.json().catch(() => ({}));
      alert(t?.error ?? "Delete failed");
      return;
    }
    await load();
  }

  function onClickDelete(l: Label) {
    const usage = l._count?.segments ?? 0;
    if (usage === 0) {
      if (confirm(`Delete label "${l.name}"?`)) void directDelete(l.id);
      return;
    }
    // open reassign dialog
    setReassignFrom(l);
    // preselect first different label if available
    const firstOther = labels.find(x => x.id !== l.id);
    setReassignToId(firstOther?.id ?? "");
    setReassignOpen(true);
  }

  async function confirmReassign() {
    if (!reassignFrom || !reassignToId) return;
    const payload = { fromId: reassignFrom.id, toId: reassignToId };
    const r = await fetch("/api/labels/reassign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const t = await r.json().catch(() => ({}));
      alert(t?.error ?? "Reassign failed");
      return;
    }
    setReassignOpen(false);
    setReassignFrom(null);
    setReassignToId("");
    await load();
  }

  return (
    <div className="space-y-6">
      {/* Create */}
      <div className="border rounded p-4 space-y-3">
        <h2 className="font-medium">Create new label</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="flex items-center gap-2">
            <span className="w-16">Name</span>
            <input
              className="border rounded px-2 py-1 w-full"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. bullfrog"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-16">Color</span>
            <input
              type="color"
              className="border rounded w-10 h-8 p-0"
              value={form.color}
              onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
              title="Pick a color"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-16">Hotkey</span>
            <input
              className="border rounded px-2 py-1 w-24"
              maxLength={1}
              value={form.hotkey}
              onChange={(e) => setForm((f) => ({ ...f, hotkey: e.target.value.slice(0, 1) }))}
              placeholder="1"
            />
          </label>
        </div>
        <button type="button" className="border rounded px-3 py-1" onClick={createLabel}>
          Add label
        </button>
      </div>

      {/* List / Edit */}
      <div className="border rounded">
        <div className="p-3 border-b bg-slate-50 font-medium">Existing labels</div>
        {loading ? (
          <div className="p-3 text-sm text-slate-600">Loading…</div>
        ) : err ? (
          <div className="p-3 text-sm text-red-600">Error: {err}</div>
        ) : labels.length === 0 ? (
          <div className="p-3 text-sm text-slate-600">No labels yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="p-2 border-t">Name</th>
                <th className="p-2 border-t">Color</th>
                <th className="p-2 border-t">Hotkey</th>
                <th className="p-2 border-t">Used</th>
                <th className="p-2 border-t"></th>
              </tr>
            </thead>
            <tbody>
              {labels.map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="p-2">
                    <input
                      className="border rounded px-2 py-1 w-full"
                      defaultValue={l.name}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== l.name) void updateLabel(l.id, { name: v });
                      }}
                    />
                  </td>
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-5 h-5 rounded border" style={{ background: l.color ?? undefined }} />
                      <input
                        type="color"
                        defaultValue={l.color ?? "#22c55e"}
                        onChange={(e) => void updateLabel(l.id, { color: e.target.value })}
                        className="w-10 h-8 p-0 border rounded"
                        title="Pick a color"
                      />
                    </div>
                  </td>
                  <td className="p-2">
                    <input
                      className="border rounded px-2 py-1 w-24"
                      defaultValue={l.hotkey ?? ""}
                      maxLength={1}
                      onBlur={(e) => {
                        const key = e.target.value.trim().slice(0, 1) || null;
                        if (key !== (l.hotkey ?? null)) void updateLabel(l.id, { hotkey: key });
                      }}
                    />
                  </td>
                  <td className="p-2">{l._count?.segments ?? 0}</td>
                  <td className="p-2 text-right">
                    <button
                      type="button"
                      className="border rounded px-2 py-1 text-red-600"
                      onClick={() => onClickDelete(l)}
                    >
                      Delete…
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Reassign dialog */}
      {reassignOpen && reassignFrom && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded shadow p-4 w-[420px] space-y-3">
            <h3 className="font-medium">Reassign before delete</h3>
            <p className="text-sm text-slate-600">
              Label <b>{reassignFrom.name}</b> is used by <b>{reassignFrom._count?.segments ?? 0}</b> segment(s).
              Choose a label to move those segments to, then we’ll delete <b>{reassignFrom.name}</b>.
            </p>

            <label className="text-sm">
              Move segments to:
              <select
                className="border rounded px-2 py-1 ml-2"
                value={reassignToId}
                onChange={(e) => setReassignToId(e.target.value)}
              >
                <option value="" disabled>Pick a label…</option>
                {labelOptions
                  .filter(opt => opt.id !== reassignFrom.id)
                  .map(opt => (
                    <option key={opt.id} value={opt.id}>{opt.name}</option>
                  ))}
              </select>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="border rounded px-3 py-1"
                onClick={() => { setReassignOpen(false); setReassignFrom(null); setReassignToId(""); }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="border rounded px-3 py-1 bg-red-50 text-red-700 disabled:opacity-50"
                disabled={!reassignToId}
                onClick={() => void confirmReassign()}
              >
                Reassign & Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
