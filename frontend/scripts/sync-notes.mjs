/**
 * Copies every PDF from project /Notes into frontend/public/notes/
 * and writes manifest.json for the Study notes page.
 *
 * Run automatically before dev/build, or manually: npm run sync-notes
 */
import { readdir, copyFile, mkdir, writeFile, stat } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = join(__dirname, "..");
const PROJECT_ROOT = join(FRONTEND_ROOT, "..");
const NOTES_SRC = join(PROJECT_ROOT, "Notes");
const NOTES_OUT = join(FRONTEND_ROOT, "public", "notes");

function fileBaseId(base) {
  const id = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return id || "note";
}

const TITLE_OVERRIDES = {
  pyspark: "PySpark",
  kubernetes: "Kubernetes",
};

function fileTitle(base, id) {
  const lower = id?.toLowerCase();
  if (lower && TITLE_OVERRIDES[lower]) return TITLE_OVERRIDES[lower];
  return base
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

async function main() {
  await mkdir(NOTES_OUT, { recursive: true });

  let files = [];
  try {
    await stat(NOTES_SRC);
    files = await readdir(NOTES_SRC);
  } catch {
    console.warn("[sync-notes] Folder not found (optional):", NOTES_SRC);
    files = [];
  }

  const pdfs = files
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  const seenIds = new Set();
  const topics = [];

  for (const filename of pdfs) {
    const base = filename.replace(/\.pdf$/i, "");
    let id = fileBaseId(base);
    if (seenIds.has(id)) {
      id = `${id}-${seenIds.size}`;
    }
    seenIds.add(id);

    const title = fileTitle(base, id);
    const path = `/notes/${filename.split("/").map(encodeURIComponent).join("/")}`;

    topics.push({
      id,
      title,
      description: `${title} — reference`,
      format: "pdf",
      path,
      filename,
    });

    await copyFile(join(NOTES_SRC, filename), join(NOTES_OUT, filename));
  }

  const manifest = {
    version: 1,
    generated: new Date().toISOString(),
    topics,
  };

  await writeFile(
    join(NOTES_OUT, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );

  console.log(
    `[sync-notes] ${topics.length} PDF(s) synced from Notes/ → public/notes/`
  );
}

main().catch((err) => {
  console.error("[sync-notes]", err);
  process.exit(1);
});
