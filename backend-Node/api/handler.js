import app from "../vercel-app.js";

console.log("[HANDLER] Handler file loaded");

export default function handler(req, res) {
  console.log(`[HANDLER] Received: ${req.method} ${req.url}`);
  try {
    app(req, res);
  } catch (error) {
    console.error("[HANDLER] Caught error:", error.message);
    res.status(500).json({ error: error.message });
  }
}
