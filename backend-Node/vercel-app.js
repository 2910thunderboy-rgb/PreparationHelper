import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import axios from "axios";

console.log("[VERCEL] Initializing Express app for serverless");

const app = express();

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

console.log("[VERCEL] Middleware configured");

// Simple routes
app.get("/", (req, res) => {
  console.log("[ROUTE] GET /");
  res.json({ status: "ok", message: "Backend is running" });
});

app.get("/health", (req, res) => {
  console.log("[ROUTE] GET /health");
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.post("/api/users/", (req, res) => {
  console.log("[ROUTE] POST /api/users/", req.body);
  res.json({ status: "ok", message: "Register endpoint" });
});

app.post("/api/users/auth", (req, res) => {
  console.log("[ROUTE] POST /api/users/auth");
  res.json({ status: "ok", message: "Auth endpoint" });
});

app.post("/api/users/logout", (req, res) => {
  console.log("[ROUTE] POST /api/users/logout");
  res.cookie("jwt", "", {
    httpOnly: true,
    expires: new Date(0),
    sameSite: "strict",
  });
  res.status(200).json({ message: "User logged out" });
});

// Proxy routes to Python backend (mock for now)
const PYTHON_BASE = process.env.NODE_ENV === "production" ? "https://career-ai-py.vercel.app" : "http://localhost:8000";

app.post("/api/analyze-resume/", async (req, res) => {
  console.log("[PROXY] POST /api/analyze-resume/");
  try {
    const response = await axios.post(`${PYTHON_BASE}/analyze-resume/`, req, {
      headers: {
        ...req.headers,
        host: new URL(PYTHON_BASE).host,
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    res.status(response.status).set(response.headers).send(response.data);
  } catch (err) {
    console.error("[PROXY ERROR]", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/job-recommendations", async (req, res) => {
  console.log("[MOCK] GET /job-recommendations");
  // Mock response
  res.json({
    jobs: [
      {
        title: "Software Engineer",
        company: "Tech Corp",
        location: "Remote",
        salary: "$80k - $120k",
        description: "Looking for experienced software engineer...",
        url: "https://example.com/job1"
      },
      {
        title: "Full Stack Developer",
        company: "Startup Inc",
        location: "San Francisco",
        salary: "$90k - $130k",
        description: "Join our team to build amazing products...",
        url: "https://example.com/job2"
      }
    ]
  });
});

app.post("/api/interview-evaluate", async (req, res) => {
  console.log("[MOCK] POST /api/interview-evaluate");
  // Mock response
  res.json({
    evaluation: "Your interview response was good. You demonstrated knowledge of the topic and provided a clear explanation. To improve: Add more specific examples and consider edge cases."
  });
});

app.post("/api/resume/tailor-latex", async (req, res) => {
  console.log("[MOCK] POST /api/resume/tailor-latex");
  // Mock response
  res.json({
    tailored_resume: "\\documentclass{article}\\begin{document}Mock tailored resume content...\\end{document}"
  });
});

app.post("/api/referral/linkedin-mutuals", async (req, res) => {
  console.log("[MOCK] POST /api/referral/linkedin-mutuals");
  // Mock response
  res.json({
    mutuals: [
      { name: "John Doe", profile: "https://linkedin.com/in/johndoe" },
      { name: "Jane Smith", profile: "https://linkedin.com/in/janesmith" }
    ]
  });
});

app.post("/api/referral/generate-message", async (req, res) => {
  console.log("[MOCK] POST /api/referral/generate-message");
  // Mock response
  res.json({
    message: "Hi [Name], I came across this opportunity and thought it might be a great fit for you. Would you be interested in learning more?"
  });
});

app.get("/api/users/profile/linkedin", async (req, res) => {
  console.log("[MOCK] GET /api/users/profile/linkedin");
  // Mock response
  res.json({
    status: "connected",
    username: "mockuser"
  });
});

app.put("/api/users/profile/linkedin", async (req, res) => {
  console.log("[MOCK] PUT /api/users/profile/linkedin");
  // Mock response
  res.json({
    message: "LinkedIn credentials updated successfully"
  });
});

app.use((req, res) => {
  console.log("[404]", req.method, req.path);
  res.status(404).json({ error: "Not found", path: req.path });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("[ERROR]", err.message);
  res.status(500).json({ error: err.message });
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
