/**
 * Standalone outbox drain (same as POST /api/ops/outbox/run).
 * Usage: npx tsx apps/api/src/jobs/outbox-once.ts
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { configFromEnv } from "../config.js";
import {
  FilesystemArtifactStore,
  MemoryArtifactStore,
} from "../lib/artifacts.js";
import { processOutboxOnce } from "../lib/outbox.js";

function loadEnvFile(file: string): void {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadEnvFile(path.join(root, ".env"));

const config = configFromEnv();
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 2, prepare: false });
const artifactDir = path.isAbsolute(config.artifactDir)
  ? config.artifactDir
  : path.join(root, config.artifactDir);
const artifacts =
  config.objectStore === "mock"
    ? new MemoryArtifactStore(config.publicApiBaseUrl)
    : new FilesystemArtifactStore(artifactDir, config.publicApiBaseUrl);

const result = await processOutboxOnce({
  sql,
  artifacts,
  config,
  publicApiBaseUrl: config.publicApiBaseUrl,
});
console.log(JSON.stringify(result));
await sql.end({ timeout: 5 });
