import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const questions = [
  "Explain how prototypal inheritance works in JavaScript.",
  "What is a closure and where would you use it?",
  "How does React use hooks to manage state?",
  "Describe event delegation in the DOM.",
  "How do you handle asynchronous code with async/await?",
];

const expectedKeywords = [
  ["prototype", "__proto__", "inheritance"],
  ["closure", "scope", "function"],
  ["useState", "useEffect", "hook"],
  ["event", "delegate", "bubbling", "capturing"],
  ["async", "await", "promise", "try/catch"],
];

export default function Interview() {
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState("");
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  const checkAnswer = () => {
    const text = answer.toLowerCase();
    let points = 0;
    expectedKeywords[index].forEach((keyword) => {
      if (text.includes(keyword)) points += 1;
    });
    if (points >= 2) {
      setFeedback("Great! You covered key concepts.");
      setScore((prev) => prev + 20);
    } else {
      setFeedback("Need more depth. Try including specific technical terms.");
      setScore((prev) => prev + 10);
    }

    setAnswer("");
    if (index + 1 >= questions.length) {
      setDone(true);
    } else {
      setIndex(index + 1);
    }
  };

  const finishInterview = () => {
    navigate("/app");
  };

  return (
    <div className="min-h-screen bg-[#f9fafb] p-6">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">🤖 Mock Interview</h1>

        {!done ? (
          <>
            <p className="mb-4 text-gray-700">Question {index + 1} of {questions.length}:</p>
            <p className="mb-4 font-semibold text-gray-800">{questions[index]}</p>
            <textarea
              rows={6}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              className="w-full border border-gray-300 rounded p-2 mb-3"
              placeholder="Type your answer here..."
            />
            <button
              onClick={checkAnswer}
              className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700"
              disabled={!answer.trim()}
            >
              Submit Answer
            </button>
            {feedback && <p className="mt-3 text-sm text-gray-700">{feedback}</p>}
          </>
        ) : (
          <>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Interview Complete!</h2>
            <p className="text-gray-700 mb-4">Your mock score is: <strong>{score}%</strong></p>
            <button
              onClick={finishInterview}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
            >
              Return to Dashboard
            </button>
          </>
        )}
      </div>
    </div>
  );
}
