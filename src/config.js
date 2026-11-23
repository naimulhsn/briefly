import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(__dirname, "..");
dotenv.config({ path: path.join(ROOT, ".env") });

const dataDir = path.join(ROOT, "data");
fs.mkdirSync(dataDir, { recursive: true });

function bool(name, fallback = false) {
  const v = process.env[name];
  if (v == null || v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
}

export const config = {
  root: ROOT,
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || "development",
  isProd: (process.env.NODE_ENV || "development") === "production",
  dbPath: process.env.DATABASE_PATH || path.join(dataDir, "briefly.db"),
  sessionSecret: process.env.SESSION_SECRET || "dev-only-insecure-secret-change-me",
  ingestSecret: process.env.INGEST_SECRET || "",
  timezone: "Asia/Dhaka",
  geminiKey: process.env.GEMINI_API_KEY || "",
  groqKey: process.env.GROQ_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-flash-lite-latest",
  maxAiClustersPerRun: Number(process.env.MAX_AI_CLUSTERS || 48),
  aiBatchSize: Number(process.env.AI_BATCH_SIZE || 4),
  cookieSecure: bool("COOKIE_SECURE", false),
  tursoUrl: process.env.TURSO_DATABASE_URL || "",
  tursoToken: process.env.TURSO_AUTH_TOKEN || "",
  openrouterKey: process.env.OPENROUTER_API_KEY || "",
  cerebrasKey: process.env.CEREBRAS_API_KEY || "",
  mistralKey: process.env.MISTRAL_API_KEY || "",
  cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID || "",
  cloudflareToken: process.env.CLOUDFLARE_API_TOKEN || "",
  jinaKey: process.env.JINA_API_KEY || "",
  cohereKey: process.env.COHERE_API_KEY || "",
};

