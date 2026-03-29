import express from "express"
import dotenv from "dotenv"
import userRoutes from "./routes/userRoutes.js"
import cookieParser from "cookie-parser"
import cors from "cors"
dotenv.config()
const PORT = process.env.PORT || 3000
import axios from "axios"
import http from "http"
import connectDB from "./config/db.js"

connectDB()

const app = express()

// Enable CORS for frontend origin with credentials
app.use(cors({
  origin: "http://localhost:5173",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}))

// app.use(cors());
// app.use(cors({
//   origin: "https://dev-clash-hackathon.vercel.app", // frontend domain
//   credentials: true,
//   methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
//   allowedHeaders: ["Content-Type", "Authorization"]
// }));

app.use(express.json())

app.use(cookieParser())

app.use("/api/users", userRoutes)

app.post("/api/analyze-resume", (req, res) => {
  // Proxy resume analysis request to backend-Py service
  const proxy = http.request({
    hostname: "127.0.0.1",
    port: 8000,
    path: "/analyze-resume/",
    method: "POST",
    headers: {
      ...req.headers,
      host: "127.0.0.1:8000",
    },
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxy.on("error", (err) => {
    console.error("Proxy error to analyze-resume", err);
    res.status(502).json({ error: "Analyze resume service unavailable - run backend-Py at port 8000" });
  });

  req.pipe(proxy);
});

app.post("/api/interview-evaluate", async (req, res) => {
  const { question, answer } = req.body;

  if (!question || !answer) {
    return res.status(400).json({ error: "question and answer are required" });
  }

  try {
    const response = await axios.post("http://localhost:8000/interview/evaluate", {
      question,
      answer,
    }, {
      headers: { "Content-Type": "application/json" },
    });

    return res.json(response.data);
  } catch (error) {
    console.error("Error evaluating interview answer:", error.message || error);
    return res.status(500).json({ error: "Failed to evaluate interview answer" });
  }
});

app.post("/api/referral/generate-message", async (req, res) => {
  try {
    const response = await axios.post(
      "http://127.0.0.1:8000/referral/generate-message",
      req.body,
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

app.post("/api/referral/linkedin-mutuals", async (req, res) => {
  try {
    const response = await axios.post(
      "http://127.0.0.1:8000/referral/linkedin-mutuals",
      req.body,
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

const PY_API = "http://127.0.0.1:8000";

async function fetchJsearchJobs(keywords, location) {
  const { data } = await axios.get(`${PY_API}/job-recommendations`, {
    params: { keywords, location },
    timeout: 60000,
  });
  return data;
}

app.get("/job-recommendations", async (req, res) => {
  const linkedinUsername = "9004076172";
  const linkedinPassword = "sharai@123";

  const keywords = req.query.keywords || "Software Engineer";
  const location = req.query.location || "India";

  try {
    const response = await axios.post(
      `${PY_API}/job-recommendations/linkedin`,
      {
        linkedin_username: linkedinUsername,
        linkedin_password: linkedinPassword,
        keywords,
        location,
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 180000,
      }
    );

    const linkedinErr = response.data?.error;
    const linkedinJobs = Array.isArray(response.data?.jobs) ? response.data.jobs : [];

    if (!linkedinErr && linkedinJobs.length > 0) {
      return res.json({ jobs: linkedinJobs, source: "linkedin" });
    }

    console.warn(
      "[job-recommendations] LinkedIn unavailable or empty:",
      linkedinErr || "(no jobs)"
    );

    const fb = await fetchJsearchJobs(keywords, location);
    const fbJobs = Array.isArray(fb?.jobs) ? fb.jobs : [];
    if (fbJobs.length > 0) {
      return res.json({
        jobs: fbJobs,
        source: "jsearch",
        notice:
          "LinkedIn automation did not return results (login, checkpoint, or layout change). Showing backup listings from JSearch.",
      });
    }

    const combined =
      [linkedinErr, fb?.error].filter(Boolean).join(" · ") ||
      "No jobs returned. Ensure backend-Py is running; set RAPIDAPI_KEY in backend-Py .env for backup listings.";

    return res.json({ jobs: [], error: combined });
  } catch (error) {
    console.error("Error fetching LinkedIn jobs:", error.message || error);
    try {
      const fb = await fetchJsearchJobs(keywords, location);
      const fbJobs = Array.isArray(fb?.jobs) ? fb.jobs : [];
      if (fbJobs.length > 0) {
        return res.json({
          jobs: fbJobs,
          source: "jsearch",
          notice: "Primary source failed; using backup job listings.",
        });
      }
      return res.json({
        jobs: [],
        error:
          fb?.error ||
          error.message ||
          "Cannot load jobs. Is backend-Py running on port 8000?",
      });
    } catch (e2) {
      return res.json({
        jobs: [],
        error:
          "Job service unreachable. Start backend-Py (port 8000) and ensure Node can reach it. " +
          (e2.message || ""),
      });
    }
  }
});

app.listen(PORT, () => {
  console.log("Server listening on port: " + PORT)
})
