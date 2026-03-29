import express from "express";
import dotenv from "dotenv";
import helmet from "helmet";
import userRoutes from "./routes/userRoutes.js";
import cookieParser from "cookie-parser";
import cors from "cors";
import axios from "axios";
import http from "http";
import multer from "multer";
import FormData from "form-data";
import connectDB from "./config/db.js";
import User from "./models/userModel.js";
import { optionalAuth } from "./middlewares/optionalAuthMiddleware.js";
import { decryptField } from "./utils/fieldEncryption.js";

dotenv.config();
const PORT = process.env.PORT || 3000;

connectDB();

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

app.use("/api/users", userRoutes);

app.post("/api/analyze-resume", (req, res) => {
  const proxy = http.request(
    {
      hostname: "127.0.0.1",
      port: 8000,
      path: "/analyze-resume/",
      method: "POST",
      headers: {
        ...req.headers,
        host: "127.0.0.1:8000",
      },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxy.on("error", (err) => {
    console.error("Proxy error to analyze-resume", err);
    res.status(502).json({
      error:
        "Analyze resume service unavailable - run backend-Py at port 8000",
    });
  });

  req.pipe(proxy);
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
      "http://127.0.0.1:8000/resume/tailor-latex",
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

app.post("/api/referral/linkedin-mutuals", optionalAuth, async (req, res) => {
  try {
    const creds = await resolveLinkedInCredentials(req);
    const body = { ...req.body };
    if (creds) {
      body.linkedin_username = creds.username;
      body.linkedin_password = creds.password;
    }
    const response = await axios.post(
      "http://127.0.0.1:8000/referral/linkedin-mutuals",
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

const PY_API = "http://127.0.0.1:8000";

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

app.listen(PORT, () => {
  console.log("Server listening on port: " + PORT);
});
