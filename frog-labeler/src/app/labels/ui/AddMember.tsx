// src/app/labels/ui/AddMember.tsx  (or wherever it lives)
"use client";

import { useEffect, useRef, useState } from "react";

type Suggestion = { id: string; name: string | null; email: string | null; image: string | null };

export default function AddMember({ projectId }: { projectId: string }) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<number>(-1);
  const debounce = useRef<number | null>(null);

  const isEmail = (s: string) => /\S+@\S+\.\S+/.test(s);

  useEffect(() => {
    if (!projectId) return;
    const q = query.trim();
    if (debounce.current) window.clearTimeout(debounce.current);
    if (q.length < 2) { setSuggestions([]); setOpen(false); return; }

    debounce.current = window.setTimeout(async () => {
      const r = await fetch(`/api/projects/${encodeURIComponent(projectId)}/users/search?q=${encodeURIComponent(q)}`);
      if (!r.ok) { setSuggestions([]); setOpen(false); return; }
      const data: Suggestion[] = await r.json();
      setSuggestions(data);
      setOpen(data.length > 0);
      setHighlight(data.length > 0 ? 0 : -1);
    }, 250);

    return () => { if (debounce.current) window.clearTimeout(debounce.current); };
  }, [query, projectId]);

  async function add(email: string) {
    if (!email) return;
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await fetch(`/api/projects/${encodeURIComponent(projectId)}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!r.ok) {
        const t = await r.json().catch(() => ({}));
        throw new Error(t?.error || `Failed (${r.status})`);
      }
      setMsg("Member added.");
      setQuery(""); setSuggestions([]); setOpen(false);
    } catch (e: any) {
      setErr(e.message || "Failed to add member");
    } finally {
      setBusy(false);
    }
  }

  function handleAddClick() {
    const q = query.trim();
    if (isEmail(q)) return void add(q);
    // Prefer highlighted suggestion, else first one
    if (suggestions.length > 0) {
      const pick = suggestions[Math.max(0, highlight)]?.email ?? suggestions[0]?.email;
      if (pick) return void add(pick);
    }
    setErr("Enter a full email or pick a user from the list.");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight(h => Math.min(h + 1, suggestions.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
    if (e.key === "Enter")     { e.preventDefault(); handleAddClick(); }
  }

  return (
    <div className="mt-6">
      <h2 className="font-medium mb-2">Add member to project</h2>

      <div className="relative inline-flex gap-2">
        <input
          className="border rounded px-2 py-1 w-72"
          placeholder="name or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(suggestions.length > 0)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        <button
          className="border rounded px-3 py-1 bg-emerald-200 disabled:opacity-50"
          disabled={busy || !projectId || !query.trim()}
          onClick={handleAddClick}
        >
          Add
        </button>

        {open && suggestions.length > 0 && (
          <div className="absolute left-0 top-9 z-10 w-72 bg-white border rounded shadow">
            {suggestions.map((s, i) => (
              <button
                type="button"
                key={s.id}
                className={`w-full text-left px-2 py-1 flex items-center gap-2 hover:bg-slate-50 ${i === highlight ? "bg-slate-50" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => s.email && add(s.email)}
                title={s.email ?? ""}
              >
                {s.image ? <img src={s.image} alt="" className="w-5 h-5 rounded-full" /> : <span className="w-5 h-5 rounded-full bg-slate-200 inline-block" />}
                <span className="truncate">{s.name || s.email}</span>
                {s.name && s.email && <span className="ml-auto text-slate-500 text-xs">{s.email}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {msg && <div className="text-emerald-700 text-sm mt-1">{msg}</div>}
      {err && <div className="text-red-600 text-sm mt-1">{err}</div>}

      <p className="text-xs text-slate-500 mt-2">
        Tip: choose a user from the list or type a full email address.
      </p>
    </div>
  );
}
