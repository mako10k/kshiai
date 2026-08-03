import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

async function listJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const resolved = path.join(directory, entry.name);
    return entry.isDirectory() ? listJavaScriptFiles(resolved) : [resolved];
  }));
  return files.flat().filter((file) => file.endsWith(".js"));
}

const buildDirectory = process.argv[2];
const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim() ?? "";
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";

if (!buildDirectory) throw new Error("Frontend build directory is required");
if (!supabaseUrl || !publishableKey) {
  throw new Error("Frontend Supabase build configuration is incomplete");
}

const parsedUrl = new URL(supabaseUrl);
if (parsedUrl.protocol !== "https:") {
  throw new Error("Frontend Supabase URL must use HTTPS");
}

const files = await listJavaScriptFiles(buildDirectory);
if (files.length === 0) throw new Error("Frontend build contains no JavaScript files");

let hasUrl = false;
let hasPublishableKey = false;
for (const file of files) {
  const contents = await readFile(file, "utf8");
  hasUrl ||= contents.includes(supabaseUrl);
  hasPublishableKey ||= contents.includes(publishableKey);
}

if (!hasUrl || !hasPublishableKey) {
  throw new Error("Frontend build does not contain the required Supabase configuration");
}

console.log("Frontend Supabase build configuration verified");
