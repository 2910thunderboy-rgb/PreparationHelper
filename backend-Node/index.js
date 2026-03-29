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
  allowedHeaders: ["Content-Type", "Authorization", "Accept"],
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
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept");
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

    res.status(response.status).json(response.data);
  } catch (err) {
    console.error("Error analyzing resume", err);
    res.status(502).json({
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

app.post("/api/interview-evaluate", async (req, res) => {
  const { question, answer } = req.body;

  if (!question || !answer) {
    return res.status(400).json({ error: "question and answer are required" });
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

app.post("/api/referral/generate-message", optionalAuth, async (req, res) => {
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

app.get("/job-recommendations", optionalAuth, async (req, res) => {
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
