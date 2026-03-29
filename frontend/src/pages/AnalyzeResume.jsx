import { useState } from "react";
import axios from "axios";
import jsPDF from "jspdf";
import { recordResumeAnalysis } from "@/lib/dashboardStats";
import { API_BASE } from "@/lib/utils";

function b64ToBlob(b64, mime) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

const AnalyzeResume = () => {
  const [file, setFile] = useState(null);
  const [jobDescription, setJobDescription] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [latexFile, setLatexFile] = useState(null);
  const [latexJd, setLatexJd] = useState("");
  const [latexLoading, setLatexLoading] = useState(false);
  const [latexError, setLatexError] = useState("");
  const [tailoredTex, setTailoredTex] = useState("");
  const [pdfNote, setPdfNote] = useState(null);

  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
    setError("");
  };

  const handleSubmit = async () => {
    if (!file) {
      setError("Please upload a resume first (PDF).");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("job_description", jobDescription);

    setLoading(true);
    setAnalysis("");
    setError("");

    try {
      const response = await axios.post(`${API_BASE}/api/analyze-resume/`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        withCredentials: true,
      });

      setAnalysis(response.data.analysis);
      recordResumeAnalysis();
    } catch (e) {
      console.error("Error analyzing resume:", e);
      setError("Failed to analyze the resume. Please try again.");
    }

    setLoading(false);
  };

  const handleDownloadPDF = () => {
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "a4",
    });

    const marginLeft = 40;
    const marginTop = 40;
    const maxWidth = 500;
    const lines = doc.splitTextToSize(analysis, maxWidth);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(lines, marginLeft, marginTop);
    doc.save("Resume_Analysis_Report.pdf");
  };

  const handleTailorLatex = async () => {
    if (!latexFile) {
      setLatexError("Upload a .tex file that contains \\section{Technical Skills}.");
      return;
    }
    setLatexError("");
    setPdfNote(null);
    setTailoredTex("");
    setLatexLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", latexFile);
      fd.append("job_description", latexJd);
      const { data } = await axios.post(`${API_BASE}/api/resume/tailor-latex`, fd, {
        withCredentials: true,
        timeout: 300000,
      });
      if (data.error) {
        setLatexError(data.error);
        return;
      }
      setTailoredTex(data.latex || "");
      if (data.pdf_error) setPdfNote(data.pdf_error);
      else if (data.pdf_base64) {
        setPdfNote(null);
        const blob = b64ToBlob(data.pdf_base64, "application/pdf");
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "resume_tailored.pdf";
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      setLatexError(e.response?.data?.error || e.message || "Tailor request failed.");
    } finally {
      setLatexLoading(false);
    }
  };

  const downloadTailoredTex = () => {
    if (!tailoredTex) return;
    const blob = new Blob([tailoredTex], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "resume_tailored.tex";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#0c0a12] p-6 font-sans text-zinc-100">
      <div className="mx-auto max-w-3xl space-y-12">
        <div>
          <h2 className="text-2xl font-semibold text-violet-300">Resume analyzer (PDF)</h2>
          <p className="mt-2 text-sm text-zinc-500">
            Upload a PDF and optional job description for full-resume feedback.
          </p>

          <label className="mt-4 flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <span className="text-sm">{file ? file.name : "Upload resume (PDF)"}</span>
            <input
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>

          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Paste job description (optional)"
            className="mt-4 h-32 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm"
          />

          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className={`mt-4 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white ${
              loading ? "cursor-not-allowed opacity-50" : "hover:bg-violet-500"
            }`}
          >
            {loading ? "Analyzing…" : "Analyze resume"}
          </button>

          {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}

          {analysis && (
            <div className="mt-8 rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4">
              <h3 className="mb-2 text-lg font-semibold text-violet-200">Analysis</h3>
              <pre className="whitespace-pre-wrap text-sm text-zinc-300">{analysis}</pre>
              <button
                type="button"
                onClick={handleDownloadPDF}
                className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500"
              >
                Download analysis as PDF
              </button>
            </div>
          )}
        </div>

        <div className="border-t border-white/10 pt-10">
          <h2 className="text-2xl font-semibold text-cyan-300">LaTeX — technical skills only</h2>
          <p className="mt-2 text-sm text-zinc-500">
            Your file must include a section titled{" "}
            <code className="rounded bg-white/10 px-1 py-0.5 text-xs">\section{"{"}Technical Skills{"}"}</code>.
            Only that block is rewritten to match the job description; the rest is unchanged. If{" "}
            <code className="text-xs">pdflatex</code> is installed on the Python server, a PDF downloads
            automatically; otherwise download the .tex and compile locally.
          </p>

          <label className="mt-4 flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <span className="text-sm">{latexFile ? latexFile.name : "Upload .tex resume"}</span>
            <input
              type="file"
              accept=".tex,text/plain"
              onChange={(e) => setLatexFile(e.target.files?.[0] || null)}
              className="hidden"
            />
          </label>

          <textarea
            value={latexJd}
            onChange={(e) => setLatexJd(e.target.value)}
            placeholder="Paste the full job description"
            className="mt-4 h-40 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm"
          />

          <button
            type="button"
            onClick={handleTailorLatex}
            disabled={latexLoading}
            className={`mt-4 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-medium text-white ${
              latexLoading ? "cursor-not-allowed opacity-50" : "hover:bg-cyan-500"
            }`}
          >
            {latexLoading ? "Tailoring…" : "Tailor technical skills & build PDF"}
          </button>

          {latexError && <p className="mt-3 text-sm text-rose-400">{latexError}</p>}
          {pdfNote && <p className="mt-3 text-sm text-amber-200/90">{pdfNote}</p>}

          {tailoredTex && (
            <div className="mt-6 rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-4">
              <button
                type="button"
                onClick={downloadTailoredTex}
                className="rounded-lg bg-cyan-700 px-4 py-2 text-sm text-white hover:bg-cyan-600"
              >
                Download tailored .tex
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnalyzeResume;
