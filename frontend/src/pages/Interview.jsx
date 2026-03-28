import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

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

const expectedKeywordSets = {
  python: [
    ["gil", "thread", "performance"],
    ["list", "comprehension", "syntax"],
    ["try", "except", "exception"],
    ["yield", "iterator", "generator"],
    ["==", "is", "identity"],
    ["virtualenv", "pipenv", "dependency"],
    ["staticmethod", "classmethod", "self"],
    ["context", "with", "__enter__"],
    ["optimize", "profiling", "cython"],
    ["json", "serialize", "dumps"],
  ],
  java: [
    ["memory", "heap", "gc"],
    ["jvm", "jre", "jdk"],
    ["interface", "extends", "implements"],
    ["synchronized", "lock", "thread"],
    ["stream", "lambda", "filter"],
    ["arraylist", "linkedlist", "difference"],
    ["polymorphism", "override", "runtime"],
    ["try", "catch", "finally"],
    ["functional", "interface", "lambda"],
    ["transient", "serialization", "keyword"],
  ],
};

export default function Interview() {
  const [setName, setSetName] = useState("python");
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState("");
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [rating, setRating] = useState(null);
  const recognitionRef = useRef(null);
  const navigate = useNavigate();

  const currentQuestions = questionSets[setName];
  const currentKeywords = expectedKeywordSets[setName];

  const evaluateWithGemini = async (question, candidateAnswer) => {
    try {
      const resp = await axios.post("http://localhost:3000/api/interview-evaluate", {
        question,
        answer: candidateAnswer,
      });

      if (resp.data?.rating !== undefined) {
        setRating(resp.data.rating);
        setFeedback(resp.data.feedback || "Answer evaluated successfully.");
        setScore((prev) => Math.min(100, prev + Math.round((resp.data.rating / 5) * 20)));
      } else {
        setFeedback(resp.data.error || "Could not evaluate answer.");
      }
    } catch (error) {
      console.error("API evaluation error", error);
      setFeedback("Error evaluating answer. Please check server logs.");
    }
  };

  const checkAnswer = async () => {
    const question = currentQuestions[index];
    await evaluateWithGemini(question, answer);

    setAnswer("");
    if (index + 1 >= currentQuestions.length) {
      setDone(true);
    } else {
      setIndex(index + 1);
    }
  };

  const finishInterview = () => {
    navigate("/app");
  };

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("SpeechRecognition is not supported in this browser.");
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
      setFeedback(`Voice input error: ${event.error}`);
      setVoiceActive(false);
    };

    recognitionRef.current = recognition;
  }, []);

  const startVoice = () => {
    if (!recognitionRef.current) return;
    recognitionRef.current.start();
    setVoiceActive(true);
    setFeedback("Voice recording started... speak now.");
  };

  const stopVoice = async () => {
    if (!recognitionRef.current) return;
    recognitionRef.current.stop();
    setVoiceActive(false);
    setFeedback("Voice recording stopped. Evaluating...");

    const question = currentQuestions[index];
    await evaluateWithGemini(question, answer);
    setAnswer("");

    if (index + 1 >= currentQuestions.length) {
      setDone(true);
    } else {
      setIndex(index + 1);
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-6">
      <div className="mx-auto max-w-4xl bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl p-8 border border-indigo-100">
        <div className="mb-5 text-center">
          <h1 className="text-3xl font-black tracking-tight text-indigo-800 mb-2">🤖 Mock Interview Arena</h1>
          <p className="text-sm text-gray-600">Practice effectively for your interview — speak, pause, and evaluate with AI feedback.</p>
          <div className="mt-4 flex justify-center">
            <label htmlFor="setName" className="text-sm font-medium text-gray-600 mr-2">Question Set:</label>
            <select
              id="setName"
              value={setName}
              onChange={(e) => {
                setSetName(e.target.value);
                setIndex(0);
                setFeedback("");
                setRating(null);
              }}
              className="border border-gray-300 rounded-lg px-3 py-1 text-sm"
            >
              <option value="python">Python</option>
              <option value="java">Java</option>
            </select>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 p-4 bg-white shadow-sm mb-5">
          <div className="flex justify-between items-center mb-3">
            <div className="text-sm font-semibold text-gray-700">Set: {setName.toUpperCase()}</div>
            <div className="text-sm text-gray-500">Score: <span className="font-semibold text-indigo-700">{score}%</span>{rating !== null ? ` (Last: ${rating}/5)` : ""}</div>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-indigo-500 via-blue-500 to-purple-500" style={{ width: `${progressPercent}%` }}></div>
          </div>
          <p className="text-xs mt-2 text-gray-500">Question {index + 1} of {currentQuestions.length} ({progressPercent}%)</p>
        </div>

        {!done ? (
          <>
            <div className="mb-5">
              <p className="text-sm text-gray-500 mb-1">Current Question</p>
              <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
                <p className="text-lg font-semibold text-indigo-900">{currentQuestions[index]}</p>
              </div>
            </div>

            <textarea
              rows={6}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              className="w-full border border-gray-300 rounded-xl p-4 mb-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              placeholder="Type or speak your answer here..."
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <button
                onClick={goPrevious}
                className="bg-white text-indigo-700 border border-indigo-300 hover:bg-indigo-50 rounded-xl px-5 py-3 font-semibold disabled:opacity-50"
                disabled={index === 0}
              >
                ◀ Previous
              </button>
              <button
                onClick={goNext}
                className="bg-white text-indigo-700 border border-indigo-300 hover:bg-indigo-50 rounded-xl px-5 py-3 font-semibold disabled:opacity-50"
                disabled={index === currentQuestions.length - 1}
              >
                Next ▶
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
              <button
                onClick={startVoice}
                className={`rounded-xl px-4 py-3 font-semibold transition ${voiceActive ? 'bg-green-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                disabled={voiceActive}
              >
                {voiceActive ? 'Listening...' : '🔊 Unmute to Answer'}
              </button>
              <button
                onClick={stopVoice}
                className="rounded-xl bg-red-600 text-white px-4 py-3 font-semibold hover:bg-red-700"
                disabled={!voiceActive}
              >
                🔇 Mute to Finish & Evaluate
              </button>
              <button
                onClick={checkAnswer}
                className="rounded-xl bg-purple-600 text-white px-4 py-3 font-semibold hover:bg-purple-700"
                disabled={!answer.trim()}
              >
                ✅ Evaluate Answer
              </button>
            </div>

            <p className="mb-3 text-sm font-medium text-gray-700">
              Voice status: <span className={voiceActive ? 'text-green-600' : 'text-red-600'}>{voiceActive ? 'Listening (unmuted)' : 'Muted / idle'}</span>
            </p>

            {feedback && (
              <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-4 text-sm text-indigo-800">
                <div className="font-bold text-indigo-700 mb-2">AI Feedback Summary</div>
                <ul className="list-disc list-inside space-y-2">
                  {feedbackItems.map((item, idx) => (
                    <li key={idx}>
                      <span className="font-semibold text-indigo-800">{item.label}:</span>{" "}
                      <span className="text-gray-700">{item.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <div className="text-center">
            <h2 className="text-2xl font-bold text-indigo-900 mb-2">Interview Complete!</h2>
            <p className="text-gray-700 mb-5">Your mock score is: <span className="text-indigo-600 font-bold">{score}%</span></p>
            <button
              onClick={finishInterview}
              className="rounded-xl bg-green-600 text-white px-6 py-3 font-bold hover:bg-green-700"
            >
              Return to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
