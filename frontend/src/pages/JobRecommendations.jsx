import React, { useEffect, useState, useCallback, useMemo } from "react";
import axios from "axios";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  Calendar,
  ExternalLink,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  Sparkles,
  WifiOff,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { DASHBOARD_REFRESH_EVENT } from "@/lib/dashboardStats";

const DEFAULT_KEYWORDS = "Software Engineer";
const DEFAULT_LOCATION = "India";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function cacheKey(keywords, location) {
  return `finallyPlaced.jobRecommendations.v1|${keywords}|${location}`;
}

function readCachedJobs(keywords, location) {
  try {
    const raw = localStorage.getItem(cacheKey(keywords, location));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.ts !== "number" || !Array.isArray(parsed.jobs)) return null;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) {
      localStorage.removeItem(cacheKey(keywords, location));
      return null;
    }
    if (parsed.jobs.length === 0) return null;
    return parsed.jobs;
  } catch {
    return null;
  }
}

function displayJobTitle(title) {
  if (title == null || title === "") return "";
  return String(title).split(/\r?\n/)[0].trim();
}

function writeCachedJobs(keywords, location, jobs) {
  try {
    if (!Array.isArray(jobs) || jobs.length === 0) return;
    localStorage.setItem(
      cacheKey(keywords, location),
      JSON.stringify({ ts: Date.now(), jobs })
    );
    window.dispatchEvent(new CustomEvent(DASHBOARD_REFRESH_EVENT));
  } catch (e) {
    console.warn("Could not cache jobs", e);
  }
}

function JobCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="mb-4 h-5 w-3/4 rounded bg-zinc-700" />
      <div className="mb-2 h-4 w-1/2 rounded bg-zinc-800" />
      <div className="mb-6 h-3 w-2/3 rounded bg-zinc-800" />
      <div className="h-10 w-full rounded-xl bg-zinc-800" />
    </div>
  );
}

const JobRecommendations = () => {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [filteredJobs, setFilteredJobs] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fromCache, setFromCache] = useState(false);
  const [notice, setNotice] = useState(null);
  const [source, setSource] = useState(null);

  const keywords = DEFAULT_KEYWORDS;
  const location = DEFAULT_LOCATION;

  const loadJobs = useCallback(
    async (opts = { skipCache: false }) => {
      setError(null);
      setNotice(null);
      setSource(null);
      if (!opts.skipCache) {
        const cached = readCachedJobs(keywords, location);
        if (cached) {
          setJobs(cached);
          setFilteredJobs(cached);
          setFromCache(true);
          setLoading(false);
          return;
        }
      }

      setFromCache(false);
      setLoading(true);
      try {
        const res = await axios.get("http://localhost:3000/job-recommendations", {
          params: { keywords, location },
        });
        const list = Array.isArray(res.data.jobs) ? res.data.jobs : [];
        setNotice(typeof res.data.notice === "string" ? res.data.notice : null);
        setSource(res.data.source || null);

        if (list.length === 0 && res.data.error) {
          setError(typeof res.data.error === "string" ? res.data.error : "Could not load jobs.");
          setJobs([]);
          setFilteredJobs([]);
        } else {
          setError(null);
          setJobs(list);
          setFilteredJobs(list);
          writeCachedJobs(keywords, location, list);
        }
      } catch (err) {
        const msg =
          err.response?.data?.error ||
          err.message ||
          "Failed to load jobs.";
        setError(typeof msg === "string" ? msg : "Failed to load jobs.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    },
    [keywords, location]
  );

  useEffect(() => {
    loadJobs({ skipCache: false });
  }, [loadJobs]);

  const handleSearchChange = (e) => {
    const value = e.target.value.toLowerCase();
    setSearch(e.target.value);

    const filtered = jobs.filter(
      (job) =>
        displayJobTitle(job.job_title).toLowerCase().includes(value) ||
        job.employer_name.toLowerCase().includes(value) ||
        job.job_city?.toLowerCase().includes(value) ||
        job.job_country?.toLowerCase().includes(value)
    );

    setFilteredJobs(filtered);
  };

  const companyInitial = (name) => {
    const s = (name || "?").trim();
    return s.charAt(0).toUpperCase();
  };

  const list = useMemo(() => filteredJobs, [filteredJobs]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0c0a12] text-zinc-100">
      <div
        className="pointer-events-none fixed inset-0 opacity-40"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 85% 55% at 50% -20%, rgba(124, 58, 237, 0.45), transparent),
            radial-gradient(ellipse 45% 35% at 0% 100%, rgba(16, 185, 129, 0.08), transparent)
          `,
        }}
      />

      <div className="relative mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <motion.header
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between"
        >
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => navigate("/app")}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-300 transition hover:border-violet-500/30 hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </button>
            <div className="flex items-center gap-2 text-violet-300/90">
              <Briefcase className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={1.5} />
              <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Job matches
              </h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-lg border border-white/10 bg-black/30 px-3 py-1 text-xs text-zinc-400">
                Role: <span className="text-zinc-200">{keywords}</span>
              </span>
              <span className="rounded-lg border border-white/10 bg-black/30 px-3 py-1 text-xs text-zinc-400">
                Location: <span className="text-zinc-200">{location}</span>
              </span>
              {!loading && jobs.length > 0 && (
                <span className="rounded-lg border border-violet-500/25 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-200">
                  {list.length} shown{search ? ` of ${jobs.length}` : ""}
                </span>
              )}
              {!loading && !fromCache && source && jobs.length > 0 && (
                <span className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200/90">
                  Source: {source === "jsearch" ? "JSearch backup" : source === "linkedin" ? "LinkedIn" : source}
                </span>
              )}
            </div>
            {notice && !fromCache && (
              <div className="max-w-xl rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/95">
                <p className="font-medium text-amber-200">Notice</p>
                <p className="mt-1 leading-relaxed text-amber-100/85">{notice}</p>
              </div>
            )}
          </div>

          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center lg:flex-col lg:items-end">
            <button
              type="button"
              onClick={() => loadJobs({ skipCache: true })}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-500/35 bg-violet-500/15 px-5 py-3 text-sm font-semibold text-violet-100 transition hover:bg-violet-500/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {loading ? "Fetching…" : "Refresh listings"}
            </button>
          </div>
        </motion.header>

        {loading && jobs.length === 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <JobCardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto max-w-lg rounded-2xl border border-rose-500/20 bg-rose-500/5 p-8 text-center"
          >
            <WifiOff className="mx-auto mb-4 h-12 w-12 text-rose-300/80" />
            <p className="text-lg font-medium text-white">Couldn&apos;t load jobs</p>
            <p className="mt-2 text-sm text-zinc-400">{error}</p>
            <button
              type="button"
              onClick={() => loadJobs({ skipCache: true })}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-100"
            >
              <RefreshCw className="h-4 w-4" />
              Try again
            </button>
          </motion.div>
        ) : (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="relative mx-auto mb-10 max-w-2xl"
            >
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
              <input
                type="search"
                value={search}
                onChange={handleSearchChange}
                placeholder="Filter by title, company, or place…"
                className="w-full rounded-2xl border border-white/10 bg-black/35 py-4 pl-12 pr-4 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500/40 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
              />
            </motion.div>

            {list.length > 0 ? (
              <motion.ul
                initial="hidden"
                animate="show"
                variants={{
                  hidden: { opacity: 0 },
                  show: {
                    opacity: 1,
                    transition: { staggerChildren: 0.04 },
                  },
                }}
                className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
              >
                {list.map((job) => (
                  <motion.li
                    key={job.job_apply_link || `${job.employer_name}-${displayJobTitle(job.job_title)}`}
                    variants={{
                      hidden: { opacity: 0, y: 10 },
                      show: { opacity: 1, y: 0 },
                    }}
                    className="group flex flex-col rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-xl backdrop-blur-sm transition hover:border-violet-500/25 hover:bg-white/[0.06]"
                  >
                    <div className="mb-4 flex gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600/40 to-indigo-600/30 text-lg font-semibold text-violet-100 ring-1 ring-white/10">
                        {companyInitial(job.employer_name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h2 className="font-semibold leading-snug text-white">
                          {displayJobTitle(job.job_title)}
                        </h2>
                        <p className="mt-1 flex items-center gap-1.5 text-sm text-zinc-400">
                          <Building2 className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                          {job.employer_name}
                        </p>
                      </div>
                    </div>

                    <div className="mb-4 flex flex-wrap gap-2 text-xs">
                      <span className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-black/25 px-2.5 py-1 text-zinc-400">
                        <MapPin className="h-3 w-3 text-zinc-500" />
                        {job.job_country || "—"}
                        {job.job_city ? ` · ${job.job_city}` : ""}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-black/25 px-2.5 py-1 text-zinc-400">
                        <Sparkles className="h-3 w-3 text-violet-400/80" />
                        {job.job_employment_type || "Role"}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-black/25 px-2.5 py-1 text-zinc-400">
                        <Calendar className="h-3 w-3 text-zinc-500" />
                        {(() => {
                          try {
                            return new Date(
                              job.job_posted_at_datetime_utc
                            ).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            });
                          } catch {
                            return "—";
                          }
                        })()}
                      </span>
                    </div>

                    <a
                      href={job.job_apply_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-auto inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition hover:from-violet-500 hover:to-indigo-500"
                    >
                      Apply
                      <ExternalLink className="h-4 w-4 opacity-90" />
                    </a>
                  </motion.li>
                ))}
              </motion.ul>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] py-16 text-center"
              >
                <Search className="mx-auto mb-3 h-10 w-10 text-zinc-600" />
                <p className="text-zinc-300">
                  {jobs.length === 0
                    ? "No roles returned yet. Try refresh, or check your job API."
                    : "No jobs match your filter—try another keyword."}
                </p>
                {jobs.length === 0 && (
                  <button
                    type="button"
                    onClick={() => loadJobs({ skipCache: true })}
                    className="mt-6 text-sm font-medium text-violet-300 hover:text-violet-200"
                  >
                    Run refresh
                  </button>
                )}
              </motion.div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default JobRecommendations;
