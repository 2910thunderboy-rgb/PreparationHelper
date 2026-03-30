import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import axios from "axios";
import connectDB from "./config/db.js";
import userRoutes from "./routes/userRoutes.js";
import jwt from "jsonwebtoken";
import User from "./models/userModel.js";
import { decryptField } from "./utils/fieldEncryption.js";

console.log("[VERCEL] Initializing Express app for serverless");

const app = express();
const USE_STATIC_DEMO_VALUES = process.env.USE_STATIC_DEMO_VALUES !== "false";

// Connect DB once per lambda instance
let dbReady = false;
(async () => {
  try {
    const result = await connectDB();
    dbReady = result;
    console.log("[VERCEL] DB Ready:", dbReady);
  } catch (err) {
    console.error("[VERCEL] DB connection failed:", err.message || err);
  }
})();

// CORS configuration
app.use(cors({
  origin: [
    "https://career-ai-frontend-mu.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000"
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "X-RapidAPI-Key"],
  optionsSuccessStatus: 200,
}));

// Handle OPTIONS requests for all routes
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, X-RapidAPI-Key");
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

// debug endpoint before DB check
app.get("/test-db", async (req, res) => {
  try {
    const mongoose = (await import('mongoose')).default;
    const uri = process.env.MONGO_URI;
    console.log("[TEST-DB] Attempting connection...");
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });
    console.log("[TEST-DB] Connected:", conn.connection.host);
    res.status(200).json({ success: true, host: conn.connection.host });
    await mongoose.disconnect();
  } catch (error) {
    console.error("[TEST-DB] Error:", error.message);
    res.status(500).json({ success: false, error: error.message, details: error });
  }
});

// If DB isn’t ready, try to connect, fail fast with 503 if still not.
app.use(async (req, res, next) => {
  if (!dbReady) {
    console.log("[VERCEL] DB not ready, attempting connect for", req.method, req.path);
    try {
      const result = await connectDB();
      dbReady = result;
      console.log("[VERCEL] DB connected on demand:", dbReady);
    } catch (err) {
      console.error("[VERCEL] DB connect failed on demand:", err.message);
      return res.status(503).json({ error: "Service unavailable: DB not connected" });
    }
  }
  next();
});

// Mount user routes before proxies
app.use("/api/users", userRoutes);

// Proxy routes to Python backend
const PYTHON_BASE =
  process.env.PYTHON_BASE ||
  (process.env.NODE_ENV === "production"
    ? "https://career-ai-py.vercel.app"
    : "http://localhost:8000");

console.log("[PROXY] PYTHON_BASE", PYTHON_BASE);

const proxyRequest = async (req, res, pythonPath) => {
  const startTime = Date.now();
  const queryString = req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : "";
  const targetUrl = `${PYTHON_BASE}${pythonPath}${queryString}`;
  console.log(`[PROXY-START] ${req.method} ${req.originalUrl} -> ${targetUrl}`);

  const headers = { ...req.headers };
  delete headers.host;
  delete headers['content-length'];

  // Try to get user keys if authenticated
  let geminiKey = "";
  let rapidKey = "";
  const keyStartTime = Date.now();
  try {
    const token = req.cookies.jwt;
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId);
      if (user) {
        if (user.geminiApiKeyEnc) {
          geminiKey = decryptField(user.geminiApiKeyEnc);
        }
        if (user.rapidApiKeyEnc) {
          rapidKey = decryptField(user.rapidApiKeyEnc);
        }
      }
    }
  } catch (err) {
    console.log("[PROXY] Could not get user keys:", err.message);
  }
  console.log(`[PROXY] Keys loaded in ${Date.now() - keyStartTime}ms`);

  // Add keys to headers
  if (geminiKey) {
    headers['gemini_api_key'] = geminiKey;
  }
  if (rapidKey) {
    headers['rapid_api_key'] = rapidKey;
  }

  const isJson = req.is('application/json') || req.is('application/x-www-form-urlencoded');
  const body = (req.method === 'GET' || req.method === 'HEAD') ? undefined : (isJson ? req.body : req);

  try {
    const axiosStartTime = Date.now();
    const response = await axios({
      method: req.method,
      url: targetUrl,
      headers,
      data: body,
      responseType: 'stream',
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 120000,
    });
    console.log(`[PROXY] Axios request took ${Date.now() - axiosStartTime}ms`);

    Object.entries(response.headers).forEach(([key, value]) => {
      const lower = key.toLowerCase();
      if (['transfer-encoding', 'connection', 'content-length'].includes(lower)) return;
      res.setHeader(key, value);
    });

    res.status(response.status);
    response.data.on('end', () => {
      console.log(`[PROXY-END] ${req.method} ${req.originalUrl} completed in ${Date.now() - startTime}ms`);
    });
    response.data.pipe(res);
  } catch (err) {
    console.error('[PROXY ERROR]', req.method, req.originalUrl, err.message || err);
    const status = err.response?.status || 502;
    const data = err.response?.data;

    if (data && data.pipe) {
      res.status(status);
      data.pipe(res);
    } else {
      res.status(status).json({ error: err.message || 'Proxy error', details: err.response?.data || null });
    }
  }
};

const STATIC_REFERRAL_MESSAGE = `Hi Ananya,

Hope you’re doing well!

I came across this opportunity at Goldman Sachs and it looks like a great fit for my profile. I’d really appreciate it if you could refer me for the role.

🔗 Job link: https://hdpc.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/LateralHiring/job/142821?utm_medium=jobshare&mode=job&iis=LinkedIn
📄 Resume: https://drive.google.com/file/d/1Ei2kejcOAEAEjrjcVktV6-0IkoBey9Ac/view?usp=sharing

A quick summary about me — I’m a final-year Computer Engineering student with experience in building projects around backend systems, APIs, and AI-based tools. I’ve also worked with technologies like FastAPI, Node.js, and Python, and I’m currently focusing on developing scalable, real-world applications.

Please let me know if you need any additional details from my side. Thanks a lot for your time and help!

Best regards,
Shaunak`;

const STATIC_RESUME_ANALYSIS = `Overall Rating
8.3 / 10 (Strong fresher → close to top-tier with improvements)
💪 Strengths
Strong real-world experience
Worked at Wissen Technology with exposure to J.P. Morgan client systems
Signals production-level and enterprise experience
Excellent quantified impact
90 → 30 min optimization
Weeks → hours automation
24 hrs → 5 mins onboarding
Shows real business value (very important for firms like Goldman Sachs)
Strong technical stack
Backend + Data: Python, Node.js, PySpark
Infra: Kubernetes, AWS
Exposure to AI/ML tools
Good coding profile
Codeforces Specialist (1402)
LeetCode Knight (1902)
Shows strong problem-solving ability
Non-trivial projects
Legal tech platform + Federated Learning model
More advanced than typical CRUD projects
⚠️ Weaknesses
Cluttered presentation
Too many links
Formatting inconsistencies
Reduces readability in quick scans
Lack of clear positioning
Feels like backend + AI + data + frontend all at once
Not clearly branded as a “Backend/Data Engineer”
Some vague bullet points
Phrases like “platform enhancements” lack depth
Missing scale, complexity, or system size
Project descriptions not sharp enough
Words like “innovative” are generic
Need clearer problem → solution → impact storytelling
No strong headline/summary
Resume starts directly with education
Misses chance to immediately position yourself`;

const STATIC_JOB_RECOMMENDATIONS = [
  {
    employer_name: "Goldman Sachs",
    job_title: "Software Engineer",
    job_city: "Bengaluru",
    job_country: "India",
    job_employment_type: "FULLTIME",
    job_posted_at_datetime_utc: "2026-03-30T00:00:00.000Z",
    job_apply_link:
      "https://hdpc.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/LateralHiring/job/142821?utm_medium=jobshare&mode=job&iis=LinkedIn",
    _origin: "static",
  },
  {
    employer_name: "Google",
    job_title: "Software Engineer",
    job_city: "Bengaluru",
    job_country: "India",
    job_employment_type: "FULLTIME",
    job_posted_at_datetime_utc: "2026-03-30T00:00:00.000Z",
    job_apply_link: "https://www.google.com/about/careers/applications/jobs/results/?q=software%20engineer&location=India",
    _origin: "static",
  },
  {
    employer_name: "Microsoft",
    job_title: "Software Engineer",
    job_city: "Hyderabad",
    job_country: "India",
    job_employment_type: "FULLTIME",
    job_posted_at_datetime_utc: "2026-03-30T00:00:00.000Z",
    job_apply_link: "https://jobs.careers.microsoft.com/global/en/search?q=Software%20Engineer&lc=India",
    _origin: "static",
  },
  {
    employer_name: "Amazon",
    job_title: "Software Development Engineer",
    job_city: "Bengaluru",
    job_country: "India",
    job_employment_type: "FULLTIME",
    job_posted_at_datetime_utc: "2026-03-30T00:00:00.000Z",
    job_apply_link: "https://www.amazon.jobs/en/search?base_query=Software+Engineer&loc_query=India",
    _origin: "static",
  },
  {
    employer_name: "Meta",
    job_title: "Software Engineer",
    job_city: "Bengaluru",
    job_country: "India",
    job_employment_type: "FULLTIME",
    job_posted_at_datetime_utc: "2026-03-30T00:00:00.000Z",
    job_apply_link: "https://www.metacareers.com/jobs/?q=software%20engineer&location=India",
    _origin: "static",
  },
  {
    employer_name: "Intuit",
    job_title: "Software Engineer",
    job_city: "Bengaluru",
    job_country: "India",
    job_employment_type: "FULLTIME",
    job_posted_at_datetime_utc: "2026-03-30T00:00:00.000Z",
    job_apply_link: "https://jobs.intuit.com/search-jobs/software%20engineer/India",
    _origin: "static",
  },
  {
    employer_name: "JPMorgan Chase",
    job_title: "Software Engineer",
    job_city: "Mumbai",
    job_country: "India",
    job_employment_type: "FULLTIME",
    job_posted_at_datetime_utc: "2026-03-30T00:00:00.000Z",
    job_apply_link: "https://careers.jpmorgan.com/global/en/search?keywords=software%20engineer&location=India",
    _origin: "static",
  },
  {
    employer_name: "Morgan Stanley",
    job_title: "Technology Analyst / Software Engineer",
    job_city: "Mumbai",
    job_country: "India",
    job_employment_type: "FULLTIME",
    job_posted_at_datetime_utc: "2026-03-30T00:00:00.000Z",
    job_apply_link: "https://www.morganstanley.com/careers/career-opportunities-search?keywords=software%20engineer&location=India",
    _origin: "static",
  },
];

app.post('/api/analyze-resume/', (req, res) => {
  if (USE_STATIC_DEMO_VALUES) {
    return res.json({
      analysis: STATIC_RESUME_ANALYSIS,
    });
  }
  return proxyRequest(req, res, '/analyze-resume/');
});
app.get('/job-recommendations', (req, res) => {
  if (USE_STATIC_DEMO_VALUES) {
    return res.json({
      jobs: STATIC_JOB_RECOMMENDATIONS,
    });
  }
  return proxyRequest(req, res, '/job-recommendations');
});
const STATIC_INTERVIEW_FEEDBACK_BY_QUESTION = {
  "explain how python's gil impacts multi-threading.": {
    rating: 4,
    feedback:
      "Score: 4/5\nFeedback: Good explanation with clear understanding of threading limits in CPython.\nStrengths: Mentioned interpreter lock behavior and practical implications for CPU-bound tasks.\nWeaknesses: Could add multiprocessing comparison and when async IO helps.",
  },
  "what is list comprehension and give an example.": {
    rating: 4,
    feedback:
      "Score: 4/5\nFeedback: Solid and concise answer.\nStrengths: Defined list comprehension correctly and gave a relevant example.\nWeaknesses: Could discuss readability trade-offs for complex nested comprehensions.",
  },
  "how do you handle exceptions in python?": {
    rating: 4,
    feedback:
      "Score: 4/5\nFeedback: Practical exception-handling approach.\nStrengths: Covered try/except and clean error handling style.\nWeaknesses: Could include custom exceptions and finally/context manager usage.",
  },
  "what is a generator in python?": {
    rating: 4,
    feedback:
      "Score: 4/5\nFeedback: Strong fundamentals on lazy iteration.\nStrengths: Correctly explained generator behavior and memory efficiency.\nWeaknesses: Could add yield from and real pipeline examples.",
  },
  "explain the difference between '==' and 'is'.": {
    rating: 4,
    feedback:
      "Score: 4/5\nFeedback: Correct conceptual distinction.\nStrengths: Distinguished identity vs equality clearly.\nWeaknesses: Could include small examples with strings/ints and mutable objects.",
  },
  "how do you manage dependencies using virtualenv or pipenv?": {
    rating: 4,
    feedback:
      "Score: 4/5\nFeedback: Good workflow understanding.\nStrengths: Mentioned isolated environments and reproducible dependency files.\nWeaknesses: Could include lockfiles and CI reproducibility notes.",
  },
  "what is the difference between @staticmethod and @classmethod?": {
    rating: 4,
    feedback:
      "Score: 4/5\nFeedback: Accurate OOP explanation.\nStrengths: Differentiated class context from utility static methods.\nWeaknesses: Could add factory constructor use-case for class methods.",
  },
  "describe context managers and the with statement.": {
    rating: 4,
    feedback:
      "Score: 4/5\nFeedback: Good resource-management reasoning.\nStrengths: Explained deterministic setup/cleanup and cleaner code style.\nWeaknesses: Could mention implementing __enter__/__exit__ and contextlib.",
  },
  "how do you optimize python code for performance?": {
    rating: 3,
    feedback:
      "Score: 3/5\nFeedback: Reasonable high-level answer.\nStrengths: Focused on profiling-first mindset and efficient data structures.\nWeaknesses: Could include vectorization, caching, and algorithmic complexity examples.",
  },
  "how do you serialize an object to json in python?": {
    rating: 4,
    feedback:
      "Score: 4/5\nFeedback: Correct and practical response.\nStrengths: Covered json.dumps usage and conversion requirements.\nWeaknesses: Could mention custom encoders for datetime/complex types.",
  },
  "explain the java memory model and garbage collection.": {
    rating: 3,
    feedback:
      "Score: 3/5\nFeedback: Decent overview of runtime behavior.\nStrengths: Touched on heap/stack and GC purpose.\nWeaknesses: Could include generations, pauses, and happens-before guarantees.",
  },
  "what is the difference between jdk, jre, and jvm?": {
    rating: 5,
    feedback:
      "Score: 5/5\nFeedback: Excellent conceptual clarity.\nStrengths: Clearly separated tooling, runtime, and virtual machine responsibilities.\nWeaknesses: Could briefly mention modular JDK changes post Java 9.",
  },
  "explain inheritance and interfaces in java.": {
    rating: 4,
    feedback:
      "Score: 4/5\nFeedback: Strong object-oriented understanding.\nStrengths: Correctly explained single inheritance and interface contracts.\nWeaknesses: Could add default methods and multiple interface inheritance nuances.",
  },
  "how does the synchronized keyword work?": {
    rating: 3,
    feedback:
      "Score: 3/5\nFeedback: Good start on thread-safety concepts.\nStrengths: Mentioned intrinsic locks and mutual exclusion.\nWeaknesses: Could discuss lock scope, contention, and alternatives like ReentrantLock.",
  },
  "what are java streams and how are they used?": {
    rating: 4,
    feedback:
      "Score: 4/5\nFeedback: Correct usage-level explanation.\nStrengths: Covered map/filter/reduce pipeline style well.\nWeaknesses: Could mention terminal operations and parallel stream cautions.",
  },
  "explain the difference between arraylist and linkedlist.": {
    rating: 4,
    feedback:
      "Score: 4/5\nFeedback: Good data structure trade-off reasoning.\nStrengths: Covered indexing vs insertion/deletion characteristics.\nWeaknesses: Could include memory overhead and iteration locality notes.",
  },
  "what is polymorphism and how is it implemented?": {
    rating: 4,
    feedback:
      "Score: 4/5\nFeedback: Solid OOP fundamentals.\nStrengths: Explained runtime method dispatch and interface-based design.\nWeaknesses: Could add compile-time overloading distinction.",
  },
  "how does exception handling work in java?": {
    rating: 4,
    feedback:
      "Score: 4/5\nFeedback: Practical understanding shown.\nStrengths: Covered try/catch/finally and checked vs unchecked context.\nWeaknesses: Could include best practices for custom exception hierarchies.",
  },
  "what are functional interfaces and lambda expressions?": {
    rating: 4,
    feedback:
      "Score: 4/5\nFeedback: Strong modern Java basics.\nStrengths: Correctly linked lambdas to single-abstract-method interfaces.\nWeaknesses: Could mention method references and common built-ins (Function, Supplier).",
  },
  "what is the purpose of the transient keyword?": {
    rating: 4,
    feedback:
      "Score: 4/5\nFeedback: Correct serialization-focused answer.\nStrengths: Identified non-persistent fields in Java object serialization.\nWeaknesses: Could add security-sensitive field examples and custom writeObject behavior.",
  },
};

function getStaticInterviewEvaluation(question) {
  const key = String(question || "").trim().toLowerCase();
  const hit = STATIC_INTERVIEW_FEEDBACK_BY_QUESTION[key];
  if (hit) return hit;
  return {
    rating: 4,
    feedback:
      "Score: 4/5\nFeedback: Good answer structure and communication.\nStrengths: Covered key concepts relevant to the question.\nWeaknesses: Add one concrete real-world example and edge-case discussion.",
  };
}

app.post('/api/interview-evaluate', (req, res) => {
  const { question, answer } = req.body || {};
  if (!question || !answer) {
    return res.status(400).json({ error: 'question and answer are required' });
  }

  if (USE_STATIC_DEMO_VALUES) {
    return res.json(getStaticInterviewEvaluation(question));
  }

  return proxyRequest(req, res, '/interview/evaluate');
});
app.post('/api/resume/tailor-latex', (req, res) => proxyRequest(req, res, '/resume/tailor-latex'));
app.post('/api/referral/linkedin-mutuals', (req, res) => proxyRequest(req, res, '/referral/linkedin-mutuals'));
app.post('/api/referral/generate-message', (req, res) => {
  if (USE_STATIC_DEMO_VALUES) {
    return res.json({
      message: STATIC_REFERRAL_MESSAGE,
      source: 'static',
    });
  }
  return proxyRequest(req, res, '/referral/generate-message');
});
app.get('/api/users/profile/linkedin', (req, res) => proxyRequest(req, res, '/job-recommendations/linkedin'));
app.put('/api/users/profile/linkedin', (req, res) => proxyRequest(req, res, '/job-recommendations/linkedin'));




app.use((req, res) => {
  console.log("[404]", req.method, req.path);
  res.status(404).json({ error: "Not found", path: req.path });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("[ERROR]", err.message);
  const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
  res.status(statusCode).json({ error: err.message });
});

console.log("[VERCEL] ✅ Express app initialized");

// Only listen locally for testing, not in Vercel serverless
if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`[LOCAL] Server running on http://localhost:${PORT}`);
  });
}

export default app;
