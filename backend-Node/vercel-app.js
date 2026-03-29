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
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 200,
}));

// Handle OPTIONS requests for all routes
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
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
  const queryString = req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : "";
  const targetUrl = `${PYTHON_BASE}${pythonPath}${queryString}`;
  console.log(`[PROXY] ${req.method} ${req.originalUrl} -> ${targetUrl}`);

  const headers = { ...req.headers };
  delete headers.host;
  delete headers['content-length'];

  // Try to get user keys if authenticated
  let geminiKey = "";
  let rapidKey = "";
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

    Object.entries(response.headers).forEach(([key, value]) => {
      const lower = key.toLowerCase();
      if (['transfer-encoding', 'connection', 'content-length'].includes(lower)) return;
      res.setHeader(key, value);
    });

    res.status(response.status);
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

app.post('/api/analyze-resume/', (req, res) => proxyRequest(req, res, '/analyze-resume/'));
app.get('/job-recommendations', (req, res) => proxyRequest(req, res, '/job-recommendations'));
app.post('/api/interview-evaluate', (req, res) => proxyRequest(req, res, '/interview/evaluate'));
app.post('/api/resume/tailor-latex', (req, res) => proxyRequest(req, res, '/resume/tailor-latex'));
app.post('/api/referral/linkedin-mutuals', (req, res) => proxyRequest(req, res, '/referral/linkedin-mutuals'));
app.post('/api/referral/generate-message', (req, res) => proxyRequest(req, res, '/referral/generate-message'));
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
