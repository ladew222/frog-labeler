"use client";

import { useEffect, useMemo, useState } from "react";
import AddMember from "@/app/labels/ui/AddMember";

type Label = {
  id: string;
  name: string;
  color: string | null;
  hotkey: string | null;
  _count?: { segments: number };
};

type Project = {
  id: string;
  name: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
};

type IngestStats = { scanned: number; created: number; updated: number; bad: string[] } | null;

export default function LabelAdmin() {
  // ----- projects -----
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");

  // create-first-project form
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectId, setNewProjectId] = useState("");

  // ----- labels -----
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", color: "#22c55e", hotkey: "" });

  // reassign dialog
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignFrom, setReassignFrom] = useState<Label | null>(null);
  const [reassignToId, setReassignToId] = useState("");

  const labelOptions = useMemo(
    () => labels.map(l => ({ id: l.id, name: l.name })),
    [labels]
  );

  // ingest UI
  const [busyIngest, setBusyIngest] = useState(false);
  const [ingestErr, setIngestErr] = useState<string | null>(null);
  const [ingestStats, setIngestStats] = useState<IngestStats>(null);


  async function createProjectQuick() {
  const name = (prompt("Project name (e.g., Demo)") || "").trim();
  if (!name) return;
    const idRaw = prompt("Optional ID (letters/numbers/dashes, e.g., demo)");
    const id = idRaw?.trim() ? idRaw.trim() : undefined;

    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, id }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
     alert(j?.error || "Failed to create project");
    return;
    }
    // reload projects and select the new one
    const p = await fetch("/api/projects").then(r => r.json());
    setProjects(p);
    setProjectId(j.id);
  }

  // load user projects
  useEffect(() => {
    (async () => {
      const r = await fetch("/api/projects", { cache: "no-store" });
      if (!r.ok) return; // not signed in?
      const p: Project[] = await r.json();
      setProjects(p);
      if (!projectId && p.length) setProjectId(p[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // load labels for selected project
  async function loadLabels(pid = projectId) {
    if (!pid) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/labels?projectId=${encodeURIComponent(pid)}`, { cache: "no-store" });
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
    if (projectId) void loadLabels(projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // create first project
  async function createProject() {
    if (!newProjectName.trim()) return;
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newProjectName.trim(),
        id: newProjectId.trim() || undefined, // optional custom id
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(j?.error || "Failed to create project");
      return;
    }
    // reload projects and select
    const p: Project[] = await fetch("/api/projects").then(r => r.json());
    setProjects(p);
    setProjectId(j.id);
    setNewProjectName("");
    setNewProjectId("");
  }

  // label CRUD (scoped to project)
  async function createLabel() {
    if (!projectId || !form.name.trim()) return;
    const payload = {
      projectId,
      name: form.name.trim(),
      color: form.color,
      hotkey: form.hotkey.trim() ? form.hotkey.trim()[0] : null,
    };
    const r = await fetch("/api/labels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      alert(j?.error ?? "Create failed");
      return;
    }
    setForm({ name: "", color: "#22c55e", hotkey: "" });
    await loadLabels();
  }

  async function updateLabel(id: string, patch: Partial<Label>) {
    if (!projectId) return;
    const r = await fetch(`/api/labels/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, ...patch }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert(j?.error ?? "Update failed");
      return;
    }
    await loadLabels();
  }

  async function directDelete(id: string) {
    if (!projectId) return;
    const r = await fetch(`/api/labels/${id}?projectId=${encodeURIComponent(projectId)}`, { method: "DELETE" });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert(j?.error ?? "Delete failed");
      return;
    }
    await loadLabels();
  }

  function onClickDelete(l: Label) {
    const usage = l._count?.segments ?? 0;
    if (usage === 0) {
      if (confirm(`Delete label "${l.name}"?`)) void directDelete(l.id);
      return;
    }
    setReassignFrom(l);
    const firstOther = labels.find(x => x.id !== l.id);
    setReassignToId(firstOther?.id ?? "");
    setReassignOpen(true);
  }

  async function confirmReassign() {
    if (!projectId || !reassignFrom || !reassignToId) return;
    const payload = { projectId, fromId: reassignFrom.id, toId: reassignToId };
    const r = await fetch("/api/labels/reassign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert(j?.error ?? "Reassign failed");
      return;
    }
    setReassignOpen(false);
    setReassignFrom(null);
    setReassignToId("");
    await loadLabels();
  }

  // ingest
  async function runIngest() {
    if (!projectId) return;
    setBusyIngest(true);
    setIngestErr(null);
    setIngestStats(null);
    try {
      const res = await fetch(`/api/admin/ingest?projectId=${encodeURIComponent(projectId)}`, { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `Ingest failed (${res.status})`);
      setIngestStats(j.stats as IngestStats);
      await loadLabels();
    } catch (e: any) {
      setIngestErr(e.message || "Ingest failed");
    } finally {
      setBusyIngest(false);
    }
  }

  // ----- Empty state: no projects yet -----
  if (projects.length === 0) {
    return (
      <div className="space-y-3">
        <h2 className="font-medium">Create your first project</h2>
        <div className="flex flex-wrap gap-2">
          <input
            className="border rounded px-2 py-1"
            placeholder="Project name (e.g., Demo)"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
          />
          <input
            className="border rounded px-2 py-1"
            placeholder="Optional id (e.g., demo)"
            value={newProjectId}
            onChange={(e) => setNewProjectId(e.target.value)}
            title="Leave blank to auto-generate"
          />
          <button className="bg-emerald-600 text-white px-3 py-1.5 rounded" onClick={createProject}>
            Create project
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Project picker */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-600">Project:</span>
        <select
          className="border rounded px-2 py-1"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.role.toLowerCase()})
            </option>
          ))}
        </select>

        <button
          type="button"
          className="border rounded px-2 py-1 text-sm"
          onClick={createProjectQuick}
        >
          New project…
        </button>
      </div>


      {/* Ingest */}
      <div className="border rounded p-3 space-y-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={runIngest}
            disabled={busyIngest || !projectId}
            className="bg-emerald-600 text-white px-3 py-1.5 rounded hover:bg-emerald-700 disabled:opacity-50"
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
            {!!ingestStats.bad?.length && (
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

      {/* Create label */}
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
        <button type="button" className="border rounded px-3 py-1" onClick={createLabel} disabled={!projectId}>
          Add label
        </button>
      </div>

      {/* Labels table */}
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
                  .map(opt => <option key={opt.id} value={opt.id}>{opt.name}</option>)}
              </select>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="border rounded px-3 py-1"
                onClick={() => { setReassignOpen(false); setReassignFrom(null); setReassignToId(""); }}>
                Cancel
              </button>
              <button type="button" className="border rounded px-3 py-1 bg-red-50 text-red-700 disabled:opacity-50"
                disabled={!reassignToId} onClick={() => void confirmReassign()}>
                Reassign & Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project members (for the selected project) */}
      <AddMember projectId={projectId} />
    </div>
  );
}
