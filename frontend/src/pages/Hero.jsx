import React from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Brain,
  Briefcase,
  FileText,
  Sparkles,
  UserPlus,
} from "lucide-react";

const pillars = [
  {
    icon: FileText,
    title: "Resume intelligence",
    body: "ATS-aware analysis and role-aligned feedback from your PDFs.",
  },
  {
    icon: Brain,
    title: "Mock interviews",
    body: "Topic-based practice with AI scoring and actionable feedback.",
  },
  {
    icon: Briefcase,
    title: "Job discovery",
    body: "Curated matches with smart caching so you iterate faster.",
  },
  {
    icon: BookOpen,
    title: "Study notes",
    body: "Your topics and PDFs in one reader—synced and searchable.",
  },
  {
    icon: UserPlus,
    title: "Referrals",
    body: "Outreach drafts and mutuals to warm up introductions.",
  },
];

export default function Hero() {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05040a] pt-24 pb-20">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 100% 80% at 50% -30%, rgba(124, 58, 237, 0.35), transparent 55%),
            radial-gradient(ellipse 60% 50% at 100% 20%, rgba(59, 130, 246, 0.12), transparent),
            radial-gradient(ellipse 50% 40% at 0% 60%, rgba(16, 185, 129, 0.06), transparent)
          `,
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%2248%22%20height=%2248%22%3E%3Cpath%20d=%22M0%200h48v1H0z%22%20fill=%22%23fff%22%20fill-opacity=%22.02%22/%3E%3C/svg%3E')]" />

      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-1.5 text-xs font-medium uppercase tracking-wider text-violet-200/90">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Career workspace
          </div>

          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-6xl sm:leading-[1.08]">
            The calmest way to{" "}
            <span className="bg-gradient-to-r from-violet-300 via-fuchsia-200 to-indigo-300 bg-clip-text text-transparent">
              run your job search
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-zinc-400 sm:text-xl">
            <span className="font-medium text-zinc-200">Career.ai</span> brings mock interviews,
            resume analysis, job matches, study notes, and referral tools into one focused
            experience—built for clarity, not clutter.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-5">
            <button
              type="button"
              onClick={() => navigate("/register")}
              className="group inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-sm font-semibold text-zinc-900 shadow-xl shadow-black/40 transition hover:bg-zinc-100"
            >
              Get started
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </button>
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="rounded-full border border-white/15 bg-white/5 px-8 py-3.5 text-sm font-medium text-white backdrop-blur-sm transition hover:border-violet-500/40 hover:bg-white/10"
            >
              Log in
            </button>
          </div>
        </div>

        <div className="mx-auto mt-20 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pillars.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="group rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-transparent p-6 transition hover:border-violet-500/25 hover:from-white/[0.09]"
            >
              <div className="mb-4 inline-flex rounded-xl bg-violet-500/15 p-2.5 text-violet-300">
                <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </div>
              <h2 className="text-base font-semibold text-white">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500">{body}</p>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-16 max-w-xl text-center text-sm text-zinc-600">
          Sign in to reach your dashboard—everything you need for interviews and applications,
          without tab overload.
        </p>
      </div>
    </div>
  );
}
