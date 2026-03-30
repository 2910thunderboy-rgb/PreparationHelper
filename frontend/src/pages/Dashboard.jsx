import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Briefcase,
  FileText,
  Mic,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import {
  DASHBOARD_REFRESH_EVENT,
  getCachedJobCount,
  readDashboardStats,
} from "@/lib/dashboardStats";

function useDashboardData() {
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const onFocus = () => refresh();
    const onStats = () => refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener(DASHBOARD_REFRESH_EVENT, onStats);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(DASHBOARD_REFRESH_EVENT, onStats);
    };
  }, [refresh]);

  return useMemo(() => {
    void tick;
    const stats = readDashboardStats();
    const jobsSaved = getCachedJobCount();
    return { stats, jobsSaved };
  }, [tick]);
}

function formatShortDate(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return null;
  }
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { stats, jobsSaved } = useDashboardData();

  const user = useMemo(() => {
    try {
      const saved = localStorage.getItem("user");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  }, []);

  const name = user?.name?.split?.(" ")?.[0] || user?.name || "there";
  const email = user?.email;

  const iv = stats.interview || {};
  const rs = stats.resume || {};

  const sessions = iv.sessions || 0;
  const bestScore = iv.bestScore ?? iv.lastScore ?? null;
  const lastInterviewAt = formatShortDate(iv.lastCompletedAt);
  const lastTopic = iv.lastTopic;
  const analyses = rs.analysesCount || 0;
  const lastResumeAt = formatShortDate(rs.lastAnalyzedAt);

  const readiness = useMemo(() => {
    const interviewPart = Math.min(
      100,
      bestScore != null ? bestScore : sessions > 0 ? iv.lastScore || 40 : 15
    );
    const resumePart = analyses > 0 ? 88 : 22;
    const jobPart = Math.min(100, jobsSaved > 0 ? 35 + jobsSaved * 6 : 12);
    return Math.round(interviewPart * 0.46 + resumePart * 0.32 + jobPart * 0.22);
  }, [analyses, bestScore, iv.lastScore, jobsSaved, sessions]);

  const chartData = useMemo(() => {
    const h = iv.history;
    if (!Array.isArray(h) || h.length === 0) return [];
    return h.map((entry, i) => ({
      label: `${i + 1}`,
      score: entry.score,
      t: formatShortDate(entry.at) || `${i + 1}`,
    }));
  }, [iv.history]);

  const insights = useMemo(() => {
    const list = [];
    if (sessions === 0) {
      list.push({
        title: "Start your first mock interview",
        body: "A full run builds confidence and gives you a baseline score to improve from.",
        action: "Open mock interview",
        path: "/app/interview",
      });
    } else if (bestScore != null && bestScore < 70) {
      list.push({
        title: "Push your interview score higher",
        body: `Your best session is ${bestScore}%. Re-run with a different topic to close gaps the AI flags in feedback.`,
        action: "Practice again",
        path: "/app/interview",
      });
    } else if (bestScore != null) {
      list.push({
        title: "Strong interview momentum",
        body: `Peak score ${bestScore}%${lastTopic ? ` (${lastTopic})` : ""}. Keep sessions regular so skills stay sharp.`,
        action: "Schedule another run",
        path: "/app/interview",
      });
    }

    if (analyses === 0) {
      list.push({
        title: "Tailor your resume to roles",
        body: "Upload a PDF and optionally paste a job description for targeted feedback.",
        action: "Analyze resume",
        path: "/app/resume",
      });
    } else {
      list.push({
        title: "Resume reviews on record",
        body: `You've run ${analyses} analysis${analyses === 1 ? "" : "es"}${lastResumeAt ? ` · last ${lastResumeAt}` : ""}. Refresh after big edits.`,
        action: "Run another pass",
        path: "/app/resume",
      });
    }

    if (jobsSaved === 0) {
      list.push({
        title: "Discover saved roles",
        body: "Job matches cache locally after you fetch—build a shortlist without repeating slow searches.",
        action: "Browse jobs",
        path: "/app/job",
      });
    } else {
      list.push({
        title: `${jobsSaved} roles in your cache`,
        body: "Open recommendations to apply or refresh when you want new listings.",
        action: "View jobs",
        path: "/app/job",
      });
    }

    return list.slice(0, 3);
  }, [
    analyses,
    bestScore,
    jobsSaved,
    lastResumeAt,
    lastTopic,
    sessions,
  ]);

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.06, delayChildren: 0.05 },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <div className="min-h-screen bg-[#0c0a12] text-zinc-100">
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.35]"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 80% 50% at 50% -20%, rgba(124, 58, 237, 0.45), transparent),
            radial-gradient(ellipse 60% 40% at 100% 50%, rgba(59, 130, 246, 0.12), transparent),
            radial-gradient(ellipse 50% 30% at 0% 80%, rgba(124, 58, 237, 0.15), transparent)
          `,
        }}
      />

      <div className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="space-y-10"
        >
          {/* Hero */}
          <motion.header variants={item} className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/25 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-200">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Career.ai · Your workspace
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Welcome back, {name}
            </h1>
            {email && (
              <p className="text-sm text-zinc-500">{email}</p>
            )}
            <p className="max-w-2xl text-base leading-relaxed text-zinc-400">
              Everything here reflects your real activity—mock interviews, resume runs, and
              saved job matches. Use it to see where to focus next.
            </p>
          </motion.header>

          <div className="grid gap-6 lg:grid-cols-12">
            {/* Readiness + chart */}
            <motion.div
              variants={item}
              className="lg:col-span-5 space-y-6 rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur-xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-violet-300/90">
                    Placement readiness
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">
                    Blended from interviews, resume work, and job exploration
                  </p>
                </div>
                <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
                  <svg className="absolute h-full w-full -rotate-90" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke="rgba(255,255,255,0.08)"
                      strokeWidth="10"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke="url(#dashGrad)"
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray={`${readiness * 2.64} 264`}
                    />
                    <defs>
                      <linearGradient id="dashGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#a78bfa" />
                        <stop offset="100%" stopColor="#6366f1" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <span className="text-2xl font-semibold text-white">{readiness}</span>
                </div>
              </div>

              {chartData.length > 1 ? (
                <div className="h-44 w-full">
                  <p className="mb-2 text-xs font-medium text-zinc-500">
                    Recent mock interview scores
                  </p>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                      <XAxis dataKey="label" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
                      <Line
                        type="monotone"
                        dataKey="score"
                        stroke="#a78bfa"
                        strokeWidth={2}
                        dot={{ fill: "#a78bfa", strokeWidth: 0, r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-white/10 bg-black/20 p-5 text-center">
                  <TrendingUp className="mx-auto mb-2 h-8 w-8 text-violet-400/70" />
                  <p className="text-sm text-zinc-400">
                    Complete full mock interviews to see your score trend here.
                  </p>
                </div>
              )}
            </motion.div>

            {/* Stats */}
            <motion.div variants={item} className="lg:col-span-7 grid gap-4 sm:grid-cols-3">
              <MetricCard
                icon={Mic}
                label="Mock interviews"
                value={sessions}
                hint={
                  lastInterviewAt
                    ? `Last session ${lastInterviewAt}`
                    : "Not started yet"
                }
                accent="from-violet-500/20 to-fuchsia-500/10"
              />
              <MetricCard
                icon={FileText}
                label="Resume analyses"
                value={analyses}
                hint={
                  lastResumeAt
                    ? `Last run ${lastResumeAt}`
                    : "Upload when ready"
                }
                accent="from-blue-500/20 to-cyan-500/10"
              />
              <MetricCard
                icon={Briefcase}
                label="Jobs cached"
                value={jobsSaved}
                hint={
                  jobsSaved
                    ? "From your last fetch"
                    : "Open jobs to populate"
                }
                accent="from-emerald-500/20 to-teal-500/10"
              />
              {bestScore != null && (
                <div className="sm:col-span-3 rounded-2xl border border-white/10 bg-gradient-to-r from-violet-600/15 to-indigo-600/10 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/20">
                        <Target className="h-5 w-5 text-violet-300" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">Best interview score</p>
                        <p className="text-xs text-zinc-500">
                          {lastTopic ? `Topic: ${lastTopic}` : "Across your sessions"}
                        </p>
                      </div>
                    </div>
                    <span className="text-3xl font-semibold tabular-nums text-white">
                      {bestScore}%
                    </span>
                  </div>
                </div>
              )}
            </motion.div>
          </div>

          {/* Quick actions */}
          <motion.section variants={item} className="space-y-4">
            <h2 className="text-lg font-semibold text-white">Quick actions</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <ActionTile
                title="Mock interview"
                description="AI feedback on every answer"
                icon={Mic}
                onClick={() => navigate("/app/interview")}
              />
              <ActionTile
                title="Resume analyzer"
                description="Match your CV to real roles"
                icon={FileText}
                onClick={() => navigate("/app/resume")}
              />
              <ActionTile
                title="Job matches"
                description="Curated list with smart cache"
                icon={Briefcase}
                onClick={() => navigate("/app/job")}
              />
            </div>
          </motion.section>

          {/* Insights */}
          <motion.section variants={item} className="space-y-4">
            <h2 className="text-lg font-semibold text-white">What to do next</h2>
            <div className="grid gap-4 md:grid-cols-3">
              {insights.map((row, i) => (
                <div
                  key={i}
                  className="group flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-violet-500/30 hover:bg-white/[0.05]"
                >
                  <p className="font-medium text-white">{row.title}</p>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-400">
                    {row.body}
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate(row.path)}
                    className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-violet-300 transition group-hover:text-violet-200"
                  >
                    {row.action}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </motion.section>
        </motion.div>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, hint, accent }) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-gradient-to-br ${accent} p-5 backdrop-blur-sm`}
    >
      <Icon className="mb-3 h-5 w-5 text-white/80" strokeWidth={1.75} />
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums text-white">{value}</p>
      <p className="mt-2 text-xs text-zinc-500">{hint}</p>
    </div>
  );
}

function ActionTile({ title, description, icon: Icon, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-left transition hover:border-violet-400/40 hover:bg-white/[0.07]"
    >
      <Icon className="mb-3 h-6 w-6 text-violet-400" strokeWidth={1.75} />
      <span className="font-medium text-white">{title}</span>
      <span className="mt-1 text-sm text-zinc-500">{description}</span>
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-violet-300">
        Go
        <ArrowRight className="h-4 w-4" />
      </span>
    </button>
  );
}
