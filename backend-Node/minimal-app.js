import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

console.log("[MINIMAL] Starting minimal Express app");

const app = express();

// Basic CORS
const corsOptions = {
  origin: [
    "https://career-ai-frontend-mu.vercel.app", 
    "http://localhost:5173", 
    "http://localhost:3000"
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 200,
};

console.log("[MINIMAL] Setting up CORS");
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

console.log("[MINIMAL] Setting up body parser");
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

// Test endpoints
app.get("/", (req, res) => {
  console.log("[ENDPOINT] GET /");
  res.json({ status: "ok", message: "Minimal server is running" });
});

app.get("/health", (req, res) => {
  console.log("[ENDPOINT] GET /health");
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.post("/api/users/", (req, res) => {
  console.log("[ENDPOINT] POST /api/users/");
  res.json({ status: "ok", message: "Placeholder endpoint" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("[ERROR]", err);
  res.status(500).json({ error: err.message });
});

console.log("[MINIMAL] ✅ App configured, exporting");

export default app;
