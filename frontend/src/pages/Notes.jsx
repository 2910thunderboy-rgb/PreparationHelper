import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  BookOpen,
  FileText,
  Loader2,
  AlertCircle,
  ExternalLink,
  Maximize2,
  Minimize2,
} from "lucide-react";

const FALLBACK_TOPICS = [
  {
    id: "python",
    title: "Python",
    description: "Python — reference (fallback)",
    format: "pdf",
    path: "/notes/Python.pdf",
  },
  {
    id: "java",
    title: "Java",
    description: "Java — reference (fallback)",
    format: "pdf",
    path: "/notes/Java.pdf",
  },
  {
    id: "kubernetes",
    title: "Kubernetes",
    description: "Kubernetes — reference (fallback)",
    format: "pdf",
    path: "/notes/Kubernetes.pdf",
  },
  {
    id: "pyspark",
    title: "PySpark",
    description: "PySpark — reference (fallback)",
    format: "pdf",
    path: "/notes/Pyspark.pdf",
  },
];

export default function Notes() {
  const { topicId } = useParams();
  const navigate = useNavigate();
  const [manifest, setManifest] = useState(null);
  const [manifestError, setManifestError] = useState(null);
  const [topics, setTopics] = useState(FALLBACK_TOPICS);
  const viewerRef = useRef(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled) {
        setManifestError("Notes loading timed out. Using fallback notes list.");
        setTopics(FALLBACK_TOPICS);
      }
    }, 8000);

    fetch("/notes/manifest.json")
      .then((r) => {
        if (!r.ok) throw new Error("Unable to load study materials.");
        return r.json();
      })
      .then((data) => {
        if (!cancelled) {
          clearTimeout(timeout);
          setManifest(data);
          setTopics(
            (data?.topics || []).filter((t) => t.format === "pdf" && t.path)
          );
          setManifestError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          clearTimeout(timeout);
          setManifestError(
            e.message || "Something went wrong while loading notes. Using fallback list."
          );
          setTopics(FALLBACK_TOPICS);
        }
      });
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, []);

  // topics are preloaded from manifest or fallback list in state
  useEffect(() => {
    if (!topics.length) return;
    if (!topicId) {
      navigate(`/app/notes/${topics[0].id}`, { replace: true });
    }
  }, [topics, topicId, navigate]);

  const activeTopic = useMemo(
    () => topics.find((t) => t.id === topicId),
    [topics, topicId]
  );

  const unknownTopic = topicId && topics.length && !activeTopic;

  const onTopicChange = (e) => {
    const next = e.target.value;
    if (next) navigate(`/app/notes/${next}`);
  };

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = async () => {
    const el = viewerRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      /* ignore */
    }
  };

  const pdfSrc = activeTopic?.path
    ? `${activeTopic.path}#view=FitH`
    : "";

  return (
    <div className="relative flex min-h-screen flex-col bg-[#0c0a12] text-zinc-100">
      <div
        className="pointer-events-none fixed inset-0 opacity-35"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 80% 50% at 50% -20%, rgba(124, 58, 237, 0.4), transparent),
            radial-gradient(ellipse 50% 40% at 100% 100%, rgba(59, 130, 246, 0.08), transparent)
          `,
        }}
      />

      <div className="relative flex min-h-0 flex-1 flex-col px-4 py-6 sm:px-6 lg:px-10">
        <header className="mx-auto mb-6 w-full max-w-[1600px] shrink-0">
          <div className="flex flex-col gap-4">
            <Link
              to="/app"
              className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-300 transition hover:border-violet-500/30 hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Link>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex items-start gap-3">
                <BookOpen
                  className="mt-1 h-8 w-8 shrink-0 text-violet-400"
                  strokeWidth={1.5}
                />
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                    Study notes
                  </h1>
                </div>
              </div>

              {topics.length > 0 && (
                <div className="w-full max-w-md lg:max-w-md">
                  <label
                    htmlFor="notes-topic-select"
                    className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500"
                  >
                    <FileText className="h-4 w-4 text-violet-400/90" />
                    Topic
                  </label>
                  <div className="relative">
                    <select
                      id="notes-topic-select"
                      value={activeTopic?.id || topicId || ""}
                      onChange={onTopicChange}
                      className="w-full appearance-none rounded-xl border border-white/15 bg-zinc-900/90 py-3 pl-4 pr-10 text-base font-medium text-white shadow-inner focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/25"
                    >
                      {topics.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500">
                      ▾
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {manifestError && (
          <div className="mx-auto mb-6 flex w-full max-w-[1600px] items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{manifestError}</span>
          </div>
        )}

        {!manifest && !manifestError && (
          <div className="mx-auto flex w-full max-w-[1600px] items-center gap-2 text-zinc-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading…
          </div>
        )}

        {manifest && topics.length === 0 && !manifestError && (
          <div className="mx-auto w-full max-w-[1600px] rounded-xl border border-white/10 bg-white/[0.03] px-5 py-8 text-sm text-zinc-400">
            <p className="font-medium text-zinc-300">No PDFs found</p>
            <p className="mt-2 leading-relaxed">
              Add <code className="rounded bg-white/10 px-1.5 py-0.5 text-violet-200">.pdf</code> files
              to the <code className="rounded bg-white/10 px-1.5 py-0.5 text-violet-200">Notes</code> folder
              at the project root, then run{" "}
              <code className="rounded bg-white/10 px-1.5 py-0.5 text-zinc-200">npm run sync-notes</code>{" "}
              or restart <code className="rounded bg-white/10 px-1.5 py-0.5 text-zinc-200">npm run dev</code>.
            </p>
          </div>
        )}

        {topics.length > 0 && (
          <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col">
            <AnimatePresence mode="wait">
              {unknownTopic ? (
                <motion.div
                  key="unknown"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] py-24 text-center"
                >
                  <AlertCircle className="mb-3 h-12 w-12 text-amber-400/80" />
                  <p className="text-lg font-medium text-white">Topic not found</p>
                  <Link
                    to={`/app/notes/${topics[0].id}`}
                    className="mt-6 text-sm font-medium text-violet-300 hover:text-violet-200"
                  >
                    Go to {topics[0].title}
                  </Link>
                </motion.div>
              ) : activeTopic ? (
                <motion.div
                  key={activeTopic.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex min-h-0 flex-1 flex-col"
                >
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-white sm:text-xl">
                        {activeTopic.title}
                      </h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={toggleFullscreen}
                        className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/10"
                      >
                        {fullscreen ? (
                          <>
                            <Minimize2 className="h-4 w-4" />
                            Exit fullscreen
                          </>
                        ) : (
                          <>
                            <Maximize2 className="h-4 w-4" />
                            Fullscreen
                          </>
                        )}
                      </button>
                      <a
                        href={activeTopic.path}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/10"
                      >
                        Open in new tab
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  </div>

                  <div
                    ref={viewerRef}
                    className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl"
                    style={{ height: "min(85vh, 920px)", minHeight: "520px" }}
                  >
                    <iframe
                      title="Study notes PDF"
                      src={pdfSrc}
                      className="absolute inset-0 h-full w-full border-0"
                    />
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
