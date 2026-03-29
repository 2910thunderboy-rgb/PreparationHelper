import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="border-t border-white/[0.06] bg-[#030208] py-14 text-zinc-500">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-8 px-6 sm:flex-row sm:px-8">
        <div className="text-center sm:text-left">
          <p className="text-lg font-semibold text-white">
            Career<span className="text-violet-400">.ai</span>
          </p>
          <p className="mt-1 max-w-sm text-sm leading-relaxed">
            One workspace for practice, documents, roles, and outreach.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-6 text-sm">
          <Link to="/login" className="transition hover:text-violet-300">
            Login
          </Link>
          <Link to="/register" className="transition hover:text-violet-300">
            Sign up
          </Link>
        </div>
      </div>
      <div className="mx-auto mt-10 max-w-6xl border-t border-white/[0.04] px-6 pt-8 text-center text-xs text-zinc-600 sm:px-8">
        © {new Date().getFullYear()} Career.ai. All rights reserved.
      </div>
    </footer>
  );
}
