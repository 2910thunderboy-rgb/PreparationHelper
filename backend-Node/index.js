import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import axios from "axios";
import multer from "multer";
import FormData from "form-data";
import { decryptField } from "./utils/fieldEncryption.js";

dotenv.config();
const PORT = process.env.PORT || 3000;

console.log("[APP] Starting Career AI Backend...");
console.log("[ENV] NODE_ENV:", process.env.NODE_ENV);
console.log("[ENV] PORT:", PORT);
console.log("[ENV] MONGO_URI exists:", !!process.env.MONGO_URI);
console.log("[ENV] JWT_SECRET exists:", !!process.env.JWT_SECRET);

const app = express();

// Initialize database connection asynchronously (non-blocking)
let dbReady = false;
let dbError = null;

console.log("[DB] Attempting connection...");
(async () => {
  try {
    console.log("[DB] Importing connectDB function...");
    const { default: connectDB } = await import("./config/db.js");
    console.log("[DB] Calling connectDB()...");
    const result = await connectDB();
    dbReady = result;
    console.log("[DB] Connection result:", result);
    if (result) {
      console.log("[DB] ✅ Connected successfully");
    } else {
      console.log("[DB] ⚠️  Connection returned false");
      dbError = "Connection function returned false";
    }
  } catch (err) {
    dbReady = false;
    dbError = err.message;
    console.error("[DB] ❌ Connection failed:", err.message);
    console.error("[DB] Stack trace:", err.stack);
  }
})();

// CORS configuration
const corsOptions = {
  origin: ["https://career-ai-frontend-mu.vercel.app", "http://localhost:5173", "http://localhost:3000"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH", "HEAD"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "X-RapidAPI-Key"],
  exposedHeaders: ["Content-Length"],
  maxAge: 86400,
  preflightContinue: false,
  optionsSuccessStatus: 200,
};

console.log("[CORS] Setting up CORS middleware...");
// CORS must be FIRST
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
console.log("[CORS] ✅ CORS middleware applied");

// Custom CORS headers
app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.path}`);
  const origin = req.headers.origin;
  const allowedOrigins = ["https://career-ai-frontend-mu.vercel.app", "http://localhost:5173", "http://localhost:3000"];
  
  if (allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, X-RapidAPI-Key");
    res.header("Access-Control-Max-Age", "86400");
  }
  
  if (req.method === "OPTIONS") {
    console.log("[HTTP] ✅ OPTIONS request handled");
    return res.sendStatus(200);
  }
  next();
});

console.log("[MIDDLEWARE] Setting up body parser and cookies...");
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
console.log("[MIDDLEWARE] ✅ Body parser and cookies configured");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

const USE_STATIC_DEMO_VALUES = process.env.USE_STATIC_DEMO_VALUES !== "false";

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

// Health check endpoint
app.get("/", (req, res) => {
  console.log("[HEALTH] Root health check");
  res.json({ 
    status: "ok", 
    message: "Backend is running", 
    dbReady,
    dbError,
    timestamp: new Date().toISOString()
  });
});

app.get("/health", (req, res) => {
  console.log("[HEALTH] /health endpoint called");
  const statusCode = dbReady ? 200 : 503;
  res.status(statusCode).json({ 
    status: dbReady ? "ok" : "db_connecting", 
    dbReady,
    dbError,
    timestamp: new Date().toISOString()
  });
});

// Load routes after app is initialized
console.log("[ROUTES] Loading userRoutes...");
(async () => {
  try {
    console.log("[ROUTES] Starting async import...");
    const userRoutesModule = await import("./routes/userRoutes.js");
    console.log("[ROUTES] userRoutes module imported, type:", typeof userRoutesModule);
    const userRoutes = userRoutesModule.default;
    console.log("[ROUTES] userRoutes extracted, type:", typeof userRoutes);
    app.use("/api/users", userRoutes);
    console.log("[ROUTES] ✅ userRoutes loaded successfully");
  } catch (err) {
    console.error("[ROUTES] ❌ Failed to load userRoutes:", err.message);
    console.error("[ROUTES] Error name:", err.name);
    console.error("[ROUTES] Stack trace:", err.stack);
    // Fallback route
    app.use("/api/users", (req, res) => {
      res.status(503).json({ error: "User routes not initialized", message: err.message });
    });
  }
})();

app.post("/api/analyze-resume", upload.single("file"), async (req, res) => {
  if (USE_STATIC_DEMO_VALUES) {
    return res.json({
      analysis: STATIC_RESUME_ANALYSIS,
    });
  }

  try {
    if (!req.file) {
      return res.status(400).json({ error: "file is required" });
    }
    const form = new FormData();
    form.append("file", req.file.buffer, {
      filename: req.file.originalname || "resume.pdf",
      contentType: req.file.mimetype || "application/pdf",
    });

    const response = await axios.post(
      "https://career-ai-py.vercel.app/analyze-resume/",
      form,
      {
        headers: form.getHeaders(),
        timeout: 300000,
      }
    );

    return res.status(response.status).json(response.data);
  } catch (err) {
    console.error("Error analyzing resume", err);
    return res.status(502).json({
      error: "Analyze resume service unavailable",
    });
  }
});

app.post("/api/resume/tailor-latex", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "file is required (.tex)" });
  }
  try {
    const form = new FormData();
    form.append("file", req.file.buffer, {
      filename: req.file.originalname || "resume.tex",
      contentType: req.file.mimetype || "application/x-tex",
    });
    form.append("job_description", req.body.job_description || "");

    const response = await axios.post(
      "https://career-ai-py.vercel.app/resume/tailor-latex",
      form,
      {
        headers: form.getHeaders(),
        timeout: 300000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );
    return res.json(response.data);
  } catch (error) {
    console.error("tailor-latex proxy:", error.message || error);
    return res.status(500).json({
      error:
        error.response?.data?.error ||
        error.message ||
        "Tailor LaTeX service failed",
    });
  }
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

app.post("/api/interview-evaluate", async (req, res) => {
  const { question, answer } = req.body;

  if (!question || !answer) {
    return res.status(400).json({ error: "question and answer are required" });
  }

  if (USE_STATIC_DEMO_VALUES) {
    const staticEval = getStaticInterviewEvaluation(question);
    return res.json(staticEval);
  }

  try {
    const response = await axios.post(
      "http://localhost:8000/interview/evaluate",
      {
        question,
        answer,
      },
      {
        headers: { "Content-Type": "application/json" },
      }
    );

    return res.json(response.data);
  } catch (error) {
    console.error("Error evaluating interview answer:", error.message || error);
    return res.status(500).json({ error: "Failed to evaluate interview answer" });
  }
});

const STATIC_REFERRAL_MESSAGE = `Hi Ananya,

Hope you’re doing well!

I came across this opportunity at Goldman Sachs and it looks like a great fit for my profile. I’d really appreciate it if you could refer me for the role.

🔗 Job link: https://hdpc.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/LateralHiring/job/142821?utm_medium=jobshare&mode=job&iis=LinkedIn
📄 Resume: https://drive.google.com/file/d/1Ei2kejcOAEAEjrjcVktV6-0IkoBey9Ac/view?usp=sharing

A quick summary about me — I’m a final-year Computer Engineering student with experience in building projects around backend systems, APIs, and AI-based tools. I’ve also worked with technologies like FastAPI, Node.js, and Python, and I’m currently focusing on developing scalable, real-world applications.

Please let me know if you need any additional details from my side. Thanks a lot for your time and help!

Best regards,
Shaunak`;

app.post("/api/referral/generate-message", optionalAuth, async (req, res) => {
  if (USE_STATIC_DEMO_VALUES) {
    return res.json({
      message: STATIC_REFERRAL_MESSAGE,
      source: "static",
    });
  }

  try {
    let geminiApiKey = process.env.GOOGLE_API_KEY || ""
    let rapidApiKey = process.env.RAPIDAPI_KEY || ""

    if (req.user) {
      try {
        geminiApiKey = decryptField(req.user.geminiApiKeyEnc) || geminiApiKey
      } catch {
        geminiApiKey = geminiApiKey
      }
      try {
        rapidApiKey = decryptField(req.user.rapidApiKeyEnc) || rapidApiKey
      } catch {
        rapidApiKey = rapidApiKey
      }
    }

    const body = {
      ...req.body,
      gemini_api_key: geminiApiKey,
      rapidapi_key: rapidApiKey,
    }

    const response = await axios.post(
      "https://career-ai-py.vercel.app/referral/generate-message",
      body,
      {
        headers: { "Content-Type": "application/json" },
        timeout: 60000,
      }
    );
    return res.json(response.data);
  } catch (error) {
    console.error("Error generating referral message:", error.message || error);
    return res.status(500).json({
      error: error.response?.data?.error || "Failed to generate referral message",
    });
  }
});

app.post("/api/referral/linkedin-mutuals", optionalAuth, async (req, res) => {
  try {
    const creds = await resolveLinkedInCredentials(req);
    const body = { ...req.body };
    if (creds) {
      body.linkedin_username = creds.username;
      body.linkedin_password = creds.password;
    }
    const response = await axios.post(
      "https://career-ai-py.vercel.app/referral/linkedin-mutuals",
      body,
      {
        headers: { "Content-Type": "application/json" },
        timeout: 120000,
      }
    );
    return res.json(response.data);
  } catch (error) {
    console.error("Error fetching LinkedIn mutuals:", error.message || error);
    return res.status(500).json({
      error:
        error.response?.data?.error ||
        error.message ||
        "Failed to fetch LinkedIn mutual connections",
    });
  }
});

const PY_API = "https://career-ai-py.vercel.app";

async function fetchJsearchJobs(keywords, location) {
  const { data } = await axios.get(`${PY_API}/job-recommendations`, {
    params: { keywords, location },
    timeout: 60000,
  });
  return data;
}

async function resolveLinkedInCredentials(req) {
  if (req.user) {
    const user = await User.findById(req.user._id).select(
      "linkedinUsernameEnc linkedinPasswordEnc"
    );
    if (user?.linkedinPasswordEnc && user?.linkedinUsernameEnc) {
      try {
        return {
          username: decryptField(user.linkedinUsernameEnc),
          password: decryptField(user.linkedinPasswordEnc),
        };
      } catch (e) {
        console.error("Decrypt LinkedIn fields failed:", e.message);
      }
    }
  }
  const u = process.env.LINKEDIN_USERNAME;
  const p = process.env.LINKEDIN_PASSWORD;
  if (u && p) return { username: u, password: p };
  return null;
}

function dedupeKey(job) {
  const link = (job.job_apply_link || "").split("?")[0].toLowerCase();
  if (link && link !== "#") return `link:${link}`;
  const title = (job.job_title || "").trim().toLowerCase();
  const emp = (job.employer_name || "").trim().toLowerCase();
  return `title:${title}|${emp}`;
}

function mergeJobLists(linkedinJobs, jsearchJobs) {
  const seen = new Set();
  const out = [];
  const push = (job, origin) => {
    const k = dedupeKey(job);
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ ...job, _origin: origin });
  };
  (linkedinJobs || []).forEach((j) => push(j, "linkedin"));
  (jsearchJobs || []).forEach((j) => push(j, "jsearch"));
  return out;
}

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

app.get("/job-recommendations", optionalAuth, async (req, res) => {
  if (USE_STATIC_DEMO_VALUES) {
    return res.json({
      jobs: STATIC_JOB_RECOMMENDATIONS,
    });
  }

  const keywords = req.query.keywords || "Software Engineer";
  const location = req.query.location || "India";

  const creds = await resolveLinkedInCredentials(req);

  const liPromise = creds
    ? axios
        .post(
          `${PY_API}/job-recommendations/linkedin`,
          {
            linkedin_username: creds.username,
            linkedin_password: creds.password,
            keywords,
            location,
          },
          {
            headers: { "Content-Type": "application/json" },
            timeout: 180000,
          }
        )
        .then((r) => r.data)
        .catch((e) => ({ error: e.message, jobs: [] }))
    : Promise.resolve({ error: "no_credentials", jobs: [] });

  const jsPromise = fetchJsearchJobs(keywords, location).catch((e) => ({
    error: e.message,
    jobs: [],
  }));

  try {
    const [li, fb] = await Promise.all([liPromise, jsPromise]);

    const linkedinJobs = Array.isArray(li?.jobs) ? li.jobs : [];
    const jsearchJobs = Array.isArray(fb?.jobs) ? fb.jobs : [];

    const merged = mergeJobLists(linkedinJobs, jsearchJobs);

    const notices = [];
    if (li?.error && linkedinJobs.length === 0) {
      notices.push(
        typeof li.error === "string"
          ? `LinkedIn: ${li.error}`
          : "LinkedIn: unavailable"
      );
    }
    if (fb?.error && jsearchJobs.length === 0) {
      notices.push(
        typeof fb.error === "string" ? `JSearch: ${fb.error}` : "JSearch: unavailable"
      );
    }

    if (merged.length > 0) {
      return res.json({
        jobs: merged,
        sources: {
          linkedin: linkedinJobs.length,
          jsearch: jsearchJobs.length,
          merged: merged.length,
        },
        notice:
          notices.length > 0
            ? notices.join(" · ")
            : undefined,
      });
    }

    const errMsg =
      [li?.error, fb?.error].filter(Boolean).join(" · ") ||
      "No jobs returned. Configure RAPIDAPI_KEY in backend-Py .env for API jobs; save LinkedIn credentials in Profile or set LINKEDIN_* in .env for LinkedIn.";

    return res.json({
      jobs: [],
      error: errMsg,
      sources: { linkedin: 0, jsearch: 0, merged: 0 },
    });
  } catch (error) {
    console.error("job-recommendations:", error.message || error);
    return res.json({
      jobs: [],
      error: error.message || "Failed to load jobs",
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("[ERROR] Unhandled error:", err);
  console.error("[ERROR] Path:", req.path);
  console.error("[ERROR] Method:", req.method);
  console.error("[ERROR] Stack:", err.stack);
  
  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
    timestamp: new Date().toISOString(),
    path: req.path,
  });
});

// 404 handler
app.use((req, res) => {
  console.warn("[404] Route not found:", req.method, req.path);
  res.status(404).json({
    error: "Route not found",
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
  });
});

console.log("[APP] ✅ All middleware configured, app ready for requests");

export default app;
