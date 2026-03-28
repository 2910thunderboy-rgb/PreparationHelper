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

app.get("/job-recommendations", async (req, res) => {
  const linkedinUsername = process.env.LINKEDIN_USERNAME;
  const linkedinPassword = process.env.LINKEDIN_PASSWORD;

  if (!linkedinUsername || !linkedinPassword) {
    return res.status(500).json({ error: "LinkedIn credentials are not configured in env vars" });
  }

  const keywords = req.query.keywords || "Software Engineer";
  const location = req.query.location || "India";

  try {
    const response = await axios.post("http://localhost:8000/job-recommendations/linkedin", {
      linkedin_username: linkedinUsername,
      linkedin_password: linkedinPassword,
      keywords,
      location,
    }, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    const jobs = response.data.jobs || [];
    return res.json({ jobs });
  } catch (error) {
    console.error("Error fetching LinkedIn jobs:", error.message || error);
    return res.status(500).json({ error: "Failed to fetch LinkedIn job recommendations" });
  }
});

app.listen(PORT, () => {
  console.log("Server listening on port: " + PORT)
})
