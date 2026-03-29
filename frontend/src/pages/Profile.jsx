import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

export default function Profile() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [linkedinUser, setLinkedinUser] = useState("");
  const [linkedinPass, setLinkedinPass] = useState("");
  const [linkedinStatus, setLinkedinStatus] = useState({ configured: false, usernameHint: "" });
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("user");
      setUser(saved ? JSON.parse(saved) : null);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data } = await axios.get("http://localhost:3000/api/users/profile/linkedin", {
          withCredentials: true,
        });
        setLinkedinStatus({
          configured: data.configured,
          usernameHint: data.usernameHint || "",
        });
      } catch {
        /* not logged in or no key */
      }
    })();
  }, [user]);

  const saveLinkedIn = async () => {
    setErr(null);
    setMsg(null);
    if (!linkedinUser.trim() || !linkedinPass) {
      setErr("Enter LinkedIn email/phone and password.");
      return;
    }
    setSaving(true);
    try {
      await axios.put(
        "http://localhost:3000/api/users/profile/linkedin",
        {
          linkedinUsername: linkedinUser.trim(),
          linkedinPassword: linkedinPass,
        },
        { withCredentials: true, headers: { "Content-Type": "application/json" } }
      );
      setMsg("LinkedIn credentials saved securely (encrypted on the server).");
      setLinkedinPass("");
      setLinkedinStatus({ configured: true, usernameHint: "•••" });
    } catch (e) {
      setErr(
        e.response?.data?.message ||
          e.response?.data?.error ||
          e.message ||
          "Could not save."
      );
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0c0a12] p-8 text-zinc-100">
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="mt-4 text-zinc-400">Sign in to manage your account.</p>
        <button
          type="button"
          className="mt-6 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-medium text-white"
          onClick={() => navigate("/login")}
        >
          Log in
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0c0a12] p-6 text-zinc-100">
      <div className="mx-auto max-w-xl">
        <h1 className="text-2xl font-semibold text-white">Profile</h1>
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-6">
          <p className="text-lg font-medium">{user.name}</p>
          <p className="mt-1 text-sm text-zinc-400">{user.email}</p>
        </div>

        <div className="mt-8 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-6">
          <h2 className="text-lg font-semibold text-white">LinkedIn (for jobs & mutuals)</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Stored with AES-256-GCM on the server. Passwords are never returned to the browser.
          </p>
          {linkedinStatus.configured && (
            <p className="mt-2 text-xs text-emerald-300/90">
              Saved{linkedinStatus.usernameHint ? ` · ${linkedinStatus.usernameHint}` : ""}
            </p>
          )}
          <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-zinc-500">
            LinkedIn email or phone
          </label>
          <input
            type="text"
            value={linkedinUser}
            onChange={(e) => setLinkedinUser(e.target.value)}
            autoComplete="username"
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white"
            placeholder="Used only server-side for automation"
          />
          <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-zinc-500">
            LinkedIn password
          </label>
          <input
            type="password"
            value={linkedinPass}
            onChange={(e) => setLinkedinPass(e.target.value)}
            autoComplete="current-password"
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white"
            placeholder="••••••••"
          />
          <button
            type="button"
            disabled={saving}
            onClick={saveLinkedIn}
            className="mt-5 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Encrypt & save"}
          </button>
          {msg && <p className="mt-3 text-sm text-emerald-300">{msg}</p>}
          {err && <p className="mt-3 text-sm text-rose-300">{err}</p>}
        </div>
      </div>
    </div>
  );
}
