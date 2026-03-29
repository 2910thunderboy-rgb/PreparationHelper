import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Home,
  Loader2,
  Mic,
  MicOff,
  Send,
  Sparkles,
  Trophy,
} from "lucide-react";
import { saveInterviewCompletion } from "@/lib/dashboardStats";

const questionSets = {
  python: [
    "Explain how Python's GIL impacts multi-threading.",
    "What is list comprehension and give an example.",
    "How do you handle exceptions in Python?",
    "What is a generator in Python?",
    "Explain the difference between '==' and 'is'.",
    "How do you manage dependencies using virtualenv or pipenv?",
    "What is the difference between @staticmethod and @classmethod?",
    "Describe context managers and the with statement.",
    "How do you optimize Python code for performance?",
    "How do you serialize an object to JSON in Python?",
  ],
  java: [
    "Explain the Java memory model and garbage collection.",
    "What is the difference between JDK, JRE, and JVM?",
    "Explain inheritance and interfaces in Java.",
    "How does the synchronized keyword work?",
    "What are Java streams and how are they used?",
    "Explain the difference between ArrayList and LinkedList.",
    "What is polymorphism and how is it implemented?",
    "How does exception handling work in Java?",
    "What are functional interfaces and lambda expressions?",
    "What is the purpose of the transient keyword?",
  ],
};

const TOPICS = [
  { id: "python", label: "Python", hint: "Backend & scripting" },
  { id: "java", label: "Java", hint: "Enterprise & JVM" },
];

export default function Interview() {
  const [setName, setSetName] = useState("python");
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState("");
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [rating, setRating] = useState(null);
  const [evaluating, setEvaluating] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const recognitionRef = useRef(null);
  const navigate = useNavigate();

  const currentQuestions = questionSets[setName];

  const evaluateWithGemini = async (question, candidateAnswer) => {
    try {
      const resp = await axios.post("http://localhost:3000/api/interview-evaluate", {
        question,
        answer: candidateAnswer,
      });

      if (resp.data?.rating !== undefined) {
        setRating(resp.data.rating);
        setFeedback(resp.data.feedback || "Answer evaluated successfully.");
        return Math.round((resp.data.rating / 5) * 20);
      }
      setFeedback(resp.data.error || "Could not evaluate answer.");
      return 0;
    } catch (error) {
      console.error("API evaluation error", error);
      setFeedback("Could not reach the server. Is the API running on port 3000?");
      return 0;
    }
  };

  const advanceAfterEvaluation = async (question, answerText) => {
    if (!answerText.trim()) return;
    setEvaluating(true);
    try {
      const added = await evaluateWithGemini(question, answerText);
      const atEnd = index + 1 >= currentQuestions.length;
      setScore((prev) => {
        const next = Math.min(100, prev + added);
        if (atEnd) {
          saveInterviewCompletion(next, setName, currentQuestions.length);
          setDone(true);
        }
        return next;
      });
      setAnswer("");
      if (!atEnd) {
        setIndex((i) => i + 1);
      }
    } finally {
      setEvaluating(false);
    }
  };

  const checkAnswer = async () => {
    const question = currentQuestions[index];
    await advanceAfterEvaluation(question, answer);
  };

  const finishInterview = () => {
    navigate("/app");
  };

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setAnswer((prev) => `${prev} ${transcript}`.trim());
    };

    recognition.onerror = (event) => {
      console.error("SpeechRecognition error", event.error);
      setFeedback(`Voice: ${event.error}. You can keep typing instead.`);
      setVoiceActive(false);
    };

    recognitionRef.current = recognition;
  }, []);

  const startVoice = () => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.start();
      setVoiceActive(true);
      setFeedback("");
    } catch {
      setFeedback("Mic is already active or unavailable. Try again.");
    }
  };

  const stopVoice = async () => {
    if (!recognitionRef.current) return;
    recognitionRef.current.stop();
    setVoiceActive(false);
    const question = currentQuestions[index];
    if (answer.trim()) {
      await advanceAfterEvaluation(question, answer);
    } else {
      setFeedback("Add an answer (voice or text), then tap Evaluate.");
    }
  };

  const goPrevious = () => {
    if (index > 0) {
      setIndex((prev) => prev - 1);
      setFeedback("");
      setRating(null);
    }
  };

  const goNext = () => {
    if (index + 1 < currentQuestions.length) {
      setIndex((prev) => prev + 1);
      setFeedback("");
      setRating(null);
    }
  };

  const progressPercent = Math.round(((index + 1) / currentQuestions.length) * 100);

  const parseFeedback = (text) => {
    if (!text) return [];
    const cleaned = text.replace(/\*\*/g, "").trim();
    const pattern = /(Score|Feedback|Strengths|Weaknesses):/gi;
    const matches = [...cleaned.matchAll(pattern)];
    if (matches.length === 0) {
      return [{ label: "Feedback", value: cleaned }];
    }

    const parts = [];
    for (let i = 0; i < matches.length; i++) {
      const key = matches[i][1];
      const start = matches[i].index + matches[i][0].length;
      const end = i + 1 < matches.length ? matches[i + 1].index : cleaned.length;
      const value = cleaned.substring(start, end).trim().replace(/^[:\s]+|[:\s]+$/g, "");
      parts.push({ label: key, value: value || "No details provided." });
    }
    return parts;
  };

  const feedbackItems = parseFeedback(feedback);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0c0a12] text-zinc-100">
      <div
        className="pointer-events-none fixed inset-0 opacity-40"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 90% 60% at 50% -25%, rgba(124, 58, 237, 0.5), transparent),
            radial-gradient(ellipse 50% 40% at 100% 0%, rgba(59, 130, 246, 0.12), transparent)
          `,
        }}
      />

      <div className="relative mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <motion.header
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <button
            type="button"
            onClick={() => navigate("/app")}
            className="inline-flex items-center gap-2 self-start rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-300 transition hover:border-violet-500/30 hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </button>
          <div className="flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-200">
            <Sparkles className="h-3.5 w-3.5 shrink-0" />
            AI mock interview · {currentQuestions.length} questions
          </div>
        </motion.header>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur-xl sm:p-8"
        >
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Mock interview
            </h1>
          </div>

          {!done && (
            <div className="mb-8">
              <p className="mb-3 text-center text-xs font-medium uppercase tracking-wider text-zinc-500">
                Topic
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                {TOPICS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setSetName(t.id);
                      setIndex(0);
                      setFeedback("");
                      setRating(null);
                      setAnswer("");
                    }}
                    className={`rounded-2xl border px-5 py-3 text-left transition sm:min-w-[140px] ${
                      setName === t.id
                        ? "border-violet-500/50 bg-violet-500/15 text-white ring-1 ring-violet-400/30"
                        : "border-white/10 bg-black/20 text-zinc-400 hover:border-white/20 hover:text-zinc-200"
                    }`}
                  >
                    <span className="block font-semibold">{t.label}</span>
                    <span className="mt-0.5 block text-xs opacity-80">{t.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mb-8 rounded-xl border border-white/10 bg-black/25 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-medium text-zinc-300">
                Question {index + 1} of {currentQuestions.length}
              </span>
              <span className="tabular-nums text-violet-300">
                Session score <strong className="text-white">{score}%</strong>
                {rating != null && (
                  <span className="ml-2 text-zinc-500">· Last {rating}/5</span>
                )}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-400"
                initial={false}
                animate={{ width: `${progressPercent}%` }}
                transition={{ type: "spring", stiffness: 120, damping: 20 }}
              />
            </div>
            <div className="mt-3 flex justify-center gap-1.5">
              {currentQuestions.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-1.5 rounded-full transition ${
                    i === index
                      ? "w-4 bg-violet-400"
                      : i < index
                        ? "bg-violet-600/60"
                        : "bg-zinc-600"
                  }`}
                  title={`Question ${i + 1}`}
                />
              ))}
            </div>
          </div>

          <AnimatePresence mode="wait">
            {!done ? (
              <motion.div
                key={`q-${index}`}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.2 }}
              >
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Current question
                </p>
                <div className="mb-6 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-5 sm:p-6">
                  <p className="text-base leading-relaxed text-zinc-100 sm:text-lg">
                    {currentQuestions[index]}
                  </p>
                </div>

                <label htmlFor="interview-answer" className="sr-only">
                  Your answer
                </label>
                <textarea
                  id="interview-answer"
                  rows={6}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  disabled={evaluating}
                  className="mb-4 w-full resize-y rounded-2xl border border-white/10 bg-black/30 px-4 py-4 text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500/40 focus:outline-none focus:ring-2 focus:ring-violet-500/20 disabled:opacity-50"
                  placeholder="Write your answer here, or use the microphone below…"
                />

                <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={goPrevious}
                    disabled={index === 0 || evaluating}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-medium text-zinc-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    disabled={index === currentQuestions.length - 1 || evaluating}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-medium text-zinc-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="mb-4 rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className="mb-3 text-xs font-medium text-zinc-500">Voice (optional)</p>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={startVoice}
                      disabled={voiceActive || evaluating || !speechSupported}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600/90 py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Mic className="h-4 w-4" />
                      {speechSupported ? "Start speaking" : "Voice not supported"}
                    </button>
                    <button
                      type="button"
                      onClick={stopVoice}
                      disabled={!voiceActive || evaluating}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600/90 py-3.5 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <MicOff className="h-4 w-4" />
                      Stop &amp; evaluate
                    </button>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs">
                    <span
                      className={`inline-flex h-2 w-2 rounded-full ${
                        voiceActive ? "animate-pulse bg-emerald-400" : "bg-zinc-600"
                      }`}
                    />
                    <span className={voiceActive ? "text-emerald-300" : "text-zinc-500"}>
                      {voiceActive
                        ? "Listening—speak clearly, then stop to submit this answer"
                        : speechSupported
                          ? "Mic idle"
                          : "Use Chrome/Edge for speech, or type your answer"}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={checkAnswer}
                  disabled={!answer.trim() || evaluating}
                  className="mb-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 py-4 text-sm font-semibold text-white shadow-lg shadow-violet-900/40 transition hover:from-violet-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {evaluating ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Evaluating…
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Submit answer &amp; continue
                    </>
                  )}
                </button>

                {feedback && !evaluating && (
                  <div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.07] p-5">
                    <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-violet-200">
                      <Sparkles className="h-4 w-4" />
                      AI feedback
                    </p>
                    <ul className="space-y-3 text-sm text-zinc-300">
                      {feedbackItems.map((item, idx) => (
                        <li key={idx} className="border-l-2 border-violet-500/40 pl-3">
                          <span className="font-medium text-violet-300">{item.label}</span>
                          <span className="text-zinc-500"> — </span>
                          <span className="text-zinc-300">{item.value}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <aside className="mt-8 rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-xs leading-relaxed text-zinc-500">
                  <strong className="text-zinc-400">Tips:</strong> Short honest answers work well.
                  After feedback, your score updates; on the last question, you&apos;ll see a summary.
                  Switch topic anytime—progress resets for that set only.
                </aside>
              </motion.div>
            ) : (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="py-6 text-center"
              >
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/30 to-indigo-600/30 ring-1 ring-violet-400/30">
                  <Trophy className="h-10 w-10 text-violet-300" />
                </div>
                <h2 className="text-2xl font-semibold text-white">Session complete</h2>
                <p className="mt-2 text-zinc-400">
                  Great work finishing all {currentQuestions.length} questions in{" "}
                  <span className="font-medium text-violet-300">{setName}</span>.
                </p>
                <p className="mt-6 text-5xl font-semibold tabular-nums text-white">{score}%</p>
                <p className="mt-1 text-sm text-zinc-500">Your session score</p>
                <div className="mt-8 flex flex-col gap-3 sm:mx-auto sm:flex-row sm:justify-center">
                  <button
                    type="button"
                    onClick={finishInterview}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100"
                  >
                    <Home className="h-4 w-4" />
                    Back to dashboard
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
