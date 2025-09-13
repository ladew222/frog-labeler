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
  const [reassigning, setReassigning] = useState<{ fromId: string; toId: string }>({
    fromId: "",
    toId: "",
  });
  const [error, setError] = useState<string | null>(null);

  const fetchLabels = async () => {
    const r = await fetch("/api/labels");
    const data = await r.json();
    setLabels(data);
  };

  useEffect(() => {
    fetchLabels();
  }, []);

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
