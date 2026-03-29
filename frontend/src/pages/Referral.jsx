import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import {
  ArrowLeft,
  Building2,
  Check,
  Copy,
  Loader2,
  MessageSquarePlus,
  Sparkles,
  Users,
  AlertCircle,
  Info,
} from "lucide-react";

const TONES = [
  { id: "professional", label: "Professional" },
  { id: "warm", label: "Warm" },
  { id: "concise", label: "Concise" },
];

/** Keys must match `backend-Py/linkedin_company_ids.json` for live mutuals */
const COMPANY_OPTIONS = [
  { id: "goldman-sachs", name: "Goldman Sachs" },
  { id: "jpmorgan", name: "JPMorgan Chase" },
  { id: "morgan-stanley", name: "Morgan Stanley" },
  { id: "google", name: "Google" },
  { id: "microsoft", name: "Microsoft" },
  { id: "amazon", name: "Amazon" },
  { id: "meta", name: "Meta" },
  { id: "intuit", name: "Intuit" },
];

export default function Referral() {
  const [tab, setTab] = useState("message");

  const [fromName, setFromName] = useState("Shaunak Raiker");
  const [recipientName, setRecipientName] = useState("");
  const [jobLink, setJobLink] = useState("");
  const [jobId, setJobId] = useState("");
  const [resumeLink, setResumeLink] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [tone, setTone] = useState("professional");

  const [generated, setGenerated] = useState("");
  const [source, setSource] = useState(null);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const [companyKey, setCompanyKey] = useState(COMPANY_OPTIONS[0].id);

  const [mutualConnections, setMutualConnections] = useState([]);
  const [mutualsLoading, setMutualsLoading] = useState(false);
  const [mutualsError, setMutualsError] = useState(null);
  const [mutualsSearched, setMutualsSearched] = useState(false);

  useEffect(() => {
    setMutualConnections([]);
    setMutualsError(null);
    setMutualsSearched(false);
  }, [companyKey]);

  const loadMutuals = async () => {
    setMutualsError(null);
    setMutualsLoading(true);
    setMutualConnections([]);
    setMutualsSearched(false);
    try {
      const res = await axios.post(
        "http://localhost:3000/api/referral/linkedin-mutuals",
        { company_key: companyKey },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 120000,
          withCredentials: true,
        }
      );
      if (res.data?.error) {
        setMutualsError(res.data.error);
        return;
      }
      setMutualConnections(res.data?.connections || []);
      setMutualsSearched(true);
    } catch (e) {
      setMutualsError(
        e.response?.data?.error ||
          e.message ||
          "Could not load connections. Is the API server running?"
      );
    } finally {
      setMutualsLoading(false);
    }
  };

  const generateMessage = async () => {
    setError(null);
    setNotice(null);
    setCopied(false);
    if (!recipientName.trim() || !jobLink.trim() || !resumeLink.trim()) {
      setError("Please fill in recipient name, job link, and resume link.");
      return;
    }
    setLoading(true);
    setGenerated("");
    try {
      const res = await axios.post(
        "http://localhost:3000/api/referral/generate-message",
        {
          from_name: fromName.trim(),
          recipient_name: recipientName.trim(),
          job_link: jobLink.trim(),
          job_id: jobId.trim(),
          resume_link: resumeLink.trim(),
          company_name: companyName.trim(),
          tone,
        },
        {
          headers: { "Content-Type": "application/json" },
          withCredentials: true,
        }
      );
      if (res.data?.error) {
        setError(res.data.error);
        return;
      }
      setGenerated(res.data?.message || "");
      setSource(res.data?.source || null);
      setNotice(res.data?.notice || null);
    } catch (e) {
      setError(
        e.response?.data?.error ||
          e.message ||
          "Could not generate message. Is the API server running?"
      );
    } finally {
      setLoading(false);
    }
  };

  const copyMessage = async () => {
    if (!generated) return;
    try {
      await navigator.clipboard.writeText(generated);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to clipboard.");
    }
  };

  return (
    <div className="relative min-h-screen bg-[#0c0a12] text-zinc-100">
      <div
        className="pointer-events-none fixed inset-0 opacity-35"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 85% 55% at 50% -20%, rgba(124, 58, 237, 0.42), transparent),
            radial-gradient(ellipse 45% 35% at 100% 80%, rgba(16, 185, 129, 0.07), transparent)
          `,
        }}
      />

      <div className="relative mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-10">
          <Link
            to="/app"
            className="mb-6 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-300 transition hover:border-violet-500/30 hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-violet-500/25 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-200">
                <Sparkles className="h-3.5 w-3.5" />
                Networking & outreach
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Referrals
              </h1>
            </div>
          </div>
        </header>

        <div className="mb-8 flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-1.5">
          {[
            { id: "message", label: "Message builder", icon: MessageSquarePlus },
            { id: "mutuals", label: "Mutual connections", icon: Users },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition sm:flex-initial sm:px-6 ${
                tab === id
                  ? "bg-violet-600 text-white shadow-lg shadow-violet-900/30"
                  : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {tab === "message" ? (
            <motion.div
              key="message"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="space-y-6"
            >
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-xl backdrop-blur-sm sm:p-8">
                <h2 className="text-lg font-semibold text-white">
                  Build your referral message
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  We combine your inputs into a polished note you can paste into LinkedIn or email.
                </p>

                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                      From
                    </span>
                    <input
                      type="text"
                      value={fromName}
                      onChange={(e) => setFromName(e.target.value)}
                      placeholder="Your name as sign-off"
                      className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-violet-500/40 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                      Recipient name
                    </span>
                    <input
                      type="text"
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      placeholder="e.g. Alex Rivera"
                      className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-violet-500/40 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                      Job posting link
                    </span>
                    <input
                      type="url"
                      value={jobLink}
                      onChange={(e) => setJobLink(e.target.value)}
                      placeholder="https://…"
                      className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-violet-500/40 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                      Job ID{" "}
                      <span className="font-normal normal-case text-zinc-600">(optional)</span>
                    </span>
                    <input
                      type="text"
                      value={jobId}
                      onChange={(e) => setJobId(e.target.value)}
                      placeholder="e.g. REQ-12345 or internal posting ID"
                      className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-violet-500/40 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                      Resume or portfolio link
                    </span>
                    <input
                      type="url"
                      value={resumeLink}
                      onChange={(e) => setResumeLink(e.target.value)}
                      placeholder="PDF, portfolio, or drive link"
                      className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-violet-500/40 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                      Company (optional)
                    </span>
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="e.g. Intuit"
                      className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-violet-500/40 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                      Tone
                    </span>
                    <select
                      value={tone}
                      onChange={(e) => setTone(e.target.value)}
                      className="w-full appearance-none rounded-xl border border-white/10 bg-black/40 py-3 pl-4 pr-10 text-sm text-white focus:border-violet-500/40 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                    >
                      {TONES.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {error && (
                  <div className="mt-5 flex items-start gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    {error}
                  </div>
                )}

                <button
                  type="button"
                  onClick={generateMessage}
                  disabled={loading}
                  className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 py-4 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition hover:from-violet-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-10"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Generate message
                    </>
                  )}
                </button>
              </div>

              {(generated || notice) && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-xl backdrop-blur-sm sm:p-8">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-white">Your message</h3>
                      {source && (
                        <p className="text-xs text-zinc-500">
                          {source === "ai"
                            ? "AI-generated"
                            : source === "template"
                              ? "Template (configure GOOGLE_API_KEY for AI)"
                              : source}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={copyMessage}
                      disabled={!generated}
                      className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/10 disabled:opacity-40"
                    >
                      {copied ? (
                        <>
                          <Check className="h-4 w-4 text-emerald-400" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                  {notice && (
                    <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/95">
                      <Info className="mt-0.5 h-4 w-4 shrink-0" />
                      {notice}
                    </div>
                  )}
                  <pre className="whitespace-pre-wrap rounded-xl border border-white/10 bg-black/35 p-5 text-sm leading-relaxed text-zinc-200">
                    {generated}
                  </pre>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="mutuals"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="space-y-6"
            >
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-xl backdrop-blur-sm sm:p-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-white">
                      Mutual connections by company
                    </h2>
                    <p className="mt-1 text-sm text-zinc-500">
                      1st-degree connections who list this company as current employer on
                      LinkedIn (same filter as People search: network + current company).
                    </p>
                  </div>
                  <div className="flex w-full flex-col gap-3 sm:w-72">
                    <div>
                      <label className="mb-1.5 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                        <Building2 className="h-4 w-4 text-violet-400/90" />
                        Company
                      </label>
                      <select
                        value={companyKey}
                        onChange={(e) => setCompanyKey(e.target.value)}
                        className="w-full appearance-none rounded-xl border border-white/10 bg-black/40 py-3 pl-4 pr-10 text-sm text-white focus:border-violet-500/40 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                      >
                        {COMPANY_OPTIONS.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={loadMutuals}
                      disabled={mutualsLoading}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-violet-500/40 bg-violet-600/90 py-3 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {mutualsLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading…
                        </>
                      ) : (
                        <>
                          <Users className="h-4 w-4" />
                          Load connections
                        </>
                      )}
                    </button>
                  </div>
                </div>


                {mutualsError && (
                  <div className="mt-5 flex items-start gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    {mutualsError}
                  </div>
                )}

                <ul className="mt-6 divide-y divide-white/10 rounded-xl border border-white/10 bg-black/25">
                  {!mutualsLoading &&
                    mutualConnections.length === 0 &&
                    !mutualsError &&
                    !mutualsSearched && (
                      <li className="px-4 py-8 text-center text-sm text-zinc-500">
                        Choose a company and click &quot;Load connections&quot; to fetch names from
                        LinkedIn.
                      </li>
                    )}
                  {!mutualsLoading &&
                    mutualConnections.length === 0 &&
                    !mutualsError &&
                    mutualsSearched && (
                      <li className="px-4 py-8 text-center text-sm text-zinc-500">
                        No 1st-degree connections at this company were found for your account, or
                        LinkedIn returned no parseable results.
                      </li>
                    )}
                  {mutualConnections.map((m, i) => (
                    <li
                      key={`${m.name}-${i}`}
                      className="flex items-center justify-between gap-4 px-4 py-4 first:rounded-t-xl last:rounded-b-xl"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-white">{m.name}</p>
                        {m.headline ? (
                          <p className="text-sm text-zinc-500">{m.headline}</p>
                        ) : null}
                      </div>
                      <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-400">
                        1st-degree
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
