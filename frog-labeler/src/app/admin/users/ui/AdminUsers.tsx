"use client";

import { useEffect, useMemo, useState } from "react";

type GlobalRole = "pending" | "user" | "admin";
type ProjectRole = "VIEWER" | "MEMBER" | "ADMIN" | "OWNER";

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: GlobalRole;
  memberships: { projectId: string; projectName: string; role: ProjectRole }[];
};

type ProjectCounts = {
  audio: number;
  labels: number;
  segments: number;
  members: number;
};

type ProjectOpt = { id: string; name: string; counts?: ProjectCounts };

export default function AdminUsers() {
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [newProjectName, setNewProjectName] = useState("");

  async function load() {
    setErr(null);
    // Ask server for projects + counts; if counts are not supported yet, it still works.
    const [u, p] = await Promise.all([
      fetch(`/api/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`, { cache: "no-store" }).then(r => r.json()),
      fetch(`/api/projects?scope=all&withCounts=1`, { cache: "no-store" }).then(r => r.json()),
    ]);
    setUsers(u || []);
    setProjects(Array.isArray(p) ? p : []);
  }

  useEffect(() => { load(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, []);

  /* ---------------- Global role ---------------- */
  async function setGlobalRole(userId: string, role: GlobalRole) {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/admin/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!r.ok) throw new Error("Failed to update role");
      await load();
    } catch (e: any) {
      setErr(e.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  /* ---------------- Project membership ---------------- */
  async function addToProject(user: UserRow, projectId: string, role: ProjectRole) {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/projects/${encodeURIComponent(projectId)}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, role }),
      });
      if (!r.ok) throw new Error("Failed to add to project");
      await load();
    } catch (e: any) {
      setErr(e.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function changeProjectRole(userId: string, projectId: string, role: ProjectRole) {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/projects/${encodeURIComponent(projectId)}/members`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      if (!r.ok) throw new Error("Failed to change membership role");
      await load();
    } catch (e: any) {
      setErr(e.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeFromProject(userId: string, projectId: string) {
    if (!confirm("Remove this member from the project?")) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/projects/${encodeURIComponent(projectId)}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!r.ok) throw new Error("Failed to remove membership");
      await load();
    } catch (e: any) {
      setErr(e.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  /* ---------------- Project admin (create / delete) ---------------- */
  async function createProject() {
    const name = newProjectName.trim();
    if (!name) { alert("Enter a project name"); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error || "Create project failed");
      }
      setNewProjectName("");
      await load();
    } catch (e: any) {
      setErr(e.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function refreshProjectsOnly() {
    try {
      const p = await fetch(`/api/projects?scope=all&withCounts=1`, { cache: "no-store" }).then(r => r.json());
      setProjects(Array.isArray(p) ? p : []);
    } catch {}
  }

  async function deleteProject(p: ProjectOpt) {
    // Always re-check latest counts right before delete
    await refreshProjectsOnly();
    const latest = projects.find(x => x.id === p.id) || p;
    const c = latest.counts;

    // If we don't have counts, or there are any references, block deletion
    const hasUnknownCounts = !c;
    const hasRefs =
      !!c && (c.audio > 0 || c.labels > 0 || c.segments > 0);

    if (hasUnknownCounts) {
      alert("Cannot verify that deletion is safe (no counts available). Please ensure this project has no audio, labels, or segments before deleting.");
      return;
    }
    if (hasRefs) {
      alert(
        `This project cannot be deleted yet:\n\n` +
        `Audio files: ${c!.audio}\nLabels: ${c!.labels}\nSegments: ${c!.segments}\n\n` +
        `Please move or delete these first to avoid orphaned data.`
      );
      return;
    }

    const typed = prompt(`Type the project name to confirm deletion: "${latest.name}"`);
    if (typed !== latest.name) return;

    if (!confirm(`Really delete project "${latest.name}"? This cannot be undone.`)) return;

    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/projects/${encodeURIComponent(latest.id)}`, { method: "DELETE" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error || "Delete project failed");
      }
      await load();
    } catch (e: any) {
      setErr(e.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  const projById = useMemo(() => Object.fromEntries(projects.map(p => [p.id, p.name])), [projects]);

  return (
    <div className="space-y-6">
      {/* ---- Project admin ---- */}
      <section className="border rounded p-3">
        <div className="flex items-end gap-2 flex-wrap">
          <div className="text-slate-800 font-medium mr-auto">Project admin</div>
          <label className="text-sm">
            <div className="text-slate-600">New project</div>
            <input
              className="border rounded px-2 py-1 w-64"
              placeholder="Project name"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
            />
          </label>
          <button
            className="border rounded px-3 py-1 bg-emerald-600 text-white disabled:opacity-50"
            onClick={createProject}
            disabled={busy}
          >
            Create
          </button>
          <button
            className="border rounded px-3 py-1"
            onClick={refreshProjectsOnly}
            disabled={busy}
            title="Refresh projects"
          >
            Refresh
          </button>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm border">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left p-2 border">Project</th>
                <th className="text-left p-2 border">Audio</th>
                <th className="text-left p-2 border">Labels</th>
                <th className="text-left p-2 border">Segments</th>
                <th className="text-left p-2 border">Members</th>
                <th className="text-left p-2 border">Actions</th>
              </tr>
            </thead>
            <tbody>
              {projects.map(p => {
                const c = p.counts;
                const hasRefs = !!c && (c.audio > 0 || c.labels > 0 || c.segments > 0);
                const blockDelete = !c || hasRefs; // block if counts unknown or any references
                return (
                  <tr key={p.id}>
                    <td className="p-2 border">{p.name}</td>
                    <td className="p-2 border">{c ? c.audio : "n/a"}</td>
                    <td className="p-2 border">{c ? c.labels : "n/a"}</td>
                    <td className="p-2 border">{c ? c.segments : "n/a"}</td>
                    <td className="p-2 border">{c ? c.members : "n/a"}</td>
                    <td className="p-2 border">
                      <button
                        className={`border rounded px-2 py-1 ${blockDelete ? "opacity-50 cursor-not-allowed" : "text-red-600"}`}
                        onClick={() => !blockDelete && deleteProject(p)}
                        disabled={busy || blockDelete}
                        title={
                          !c
                            ? "Counts unavailable—cannot verify safe deletion."
                            : hasRefs
                            ? "Project still has data; move/delete audio/labels/segments first."
                            : "Delete project"
                        }
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
              {projects.length === 0 && (
                <tr><td className="p-2 text-slate-500" colSpan={6}>No projects.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---- User search ---- */}
      <div className="flex items-end gap-2">
        <label className="text-sm">
          <div className="text-slate-600">Search users</div>
          <input
            className="border rounded px-2 py-1 w-64"
            placeholder="name or email"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <button className="border rounded px-3 py-1" onClick={load} disabled={busy}>
          Search
        </button>
        {busy && <span className="text-slate-500 text-sm">Working…</span>}
        {err && <span className="text-red-600 text-sm">{err}</span>}
      </div>

      {/* ---- Users table ---- */}
      <table className="w-full text-sm border">
        <thead className="bg-slate-50">
          <tr>
            <th className="text-left p-2 border">User</th>
            <th className="text-left p-2 border">Email</th>
            <th className="text-left p-2 border">Global role</th>
            <th className="text-left p-2 border">Projects</th>
            <th className="text-left p-2 border">Add to project</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id}>
              <td className="p-2 border">
                <div className="flex items-center gap-2">
                  {u.image ? <img src={u.image} alt="" className="w-6 h-6 rounded-full" /> : <div className="w-6 h-6 rounded-full bg-slate-200" />}
                  <span>{u.name || "—"}</span>
                </div>
              </td>
              <td className="p-2 border">{u.email || "—"}</td>
              <td className="p-2 border">
                <select
                  className="border rounded px-2 py-1"
                  value={u.role}
                  onChange={(e) => setGlobalRole(u.id, e.target.value as any)}
                  disabled={busy}
                >
                  <option value="pending">pending</option>
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
              </td>
              <td className="p-2 border">
                <div className="flex flex-wrap gap-2">
                  {u.memberships.length === 0 && <span className="text-slate-500">—</span>}
                  {u.memberships.map(m => (
                    <div key={m.projectId} className="border rounded px-2 py-1 flex items-center gap-2">
                      <span className="font-medium">{m.projectName}</span>
                      <select
                        className="border rounded px-1 py-0.5 text-xs"
                        value={m.role}
                        onChange={(e) => changeProjectRole(u.id, m.projectId, e.target.value as ProjectRole)}
                        disabled={busy}
                      >
                        <option value="VIEWER">VIEWER</option>
                        <option value="MEMBER">MEMBER</option>
                        <option value="ADMIN">ADMIN</option>
                        <option value="OWNER">OWNER</option>
                      </select>
                      <button
                        className="text-red-600 underline text-xs"
                        onClick={() => removeFromProject(u.id, m.projectId)}
                        disabled={busy}
                      >
                        remove
                      </button>
                    </div>
                  ))}
                </div>
              </td>
              <td className="p-2 border">
                <div className="flex items-center gap-2">
                  <select id={`p-${u.id}`} className="border rounded px-2 py-1">
                    <option value="">— choose project —</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <select id={`r-${u.id}`} className="border rounded px-2 py-1">
                    <option value="MEMBER">MEMBER</option>
                    <option value="VIEWER">VIEWER</option>
                    <option value="ADMIN">ADMIN</option>
                    <option value="OWNER">OWNER</option>
                  </select>
                  <button
                    className="border rounded px-2 py-1"
                    disabled={busy || !u.email}
                    onClick={() => {
                      const pid = (document.getElementById(`p-${u.id}`) as HTMLSelectElement)?.value;
                      const role = (document.getElementById(`r-${u.id}`) as HTMLSelectElement)?.value as ProjectRole;
                      if (!pid) return alert("Pick a project");
                      addToProject(u, pid, role);
                    }}
                  >
                    Add
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {users.length === 0 && (
            <tr><td className="p-2 text-slate-500" colSpan={5}>No users.</td></tr>
          )}
        </tbody>
      </table>

      <p className="text-xs text-slate-500">
        Tip: “Global role” controls access to admin features. Project roles control access within each project.
      </p>
    </div>
  );
}
