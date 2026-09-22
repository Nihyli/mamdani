import { serve } from "@hono/node-server";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { ProfileRole } from "@mamdani-ticketer/contracts";
import { createApp, type Authenticate } from "./app.js";
import { configFromEnv } from "./config.js";
import { FilesystemObjectStore, MemoryObjectStore } from "./object-store.js";
import {
  FilesystemArtifactStore,
  MemoryArtifactStore,
} from "./lib/artifacts.js";

loadEnvFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env"));

const config = configFromEnv();
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const uploadDir = path.isAbsolute(config.uploadDir)
  ? config.uploadDir
  : path.resolve(repoRoot, config.uploadDir);
const artifactDir = path.isAbsolute(config.artifactDir)
  ? config.artifactDir
  : path.resolve(repoRoot, config.artifactDir);
const databaseUrl = process.env.DATABASE_URL;
const sql = databaseUrl
  ? postgres(databaseUrl, { max: 4, prepare: false })
  : null;

const objectStore =
  config.objectStore === "mock"
    ? new MemoryObjectStore(config.publicUploadBaseUrl)
    : new FilesystemObjectStore(uploadDir, config.publicUploadBaseUrl);

const artifacts =
  config.objectStore === "mock"
    ? new MemoryArtifactStore(config.publicApiBaseUrl)
    : new FilesystemArtifactStore(artifactDir, config.publicApiBaseUrl);

const authenticate: Authenticate = async (authorization, digUser, digRole) => {
  if (config.allowDevAuth && digUser) {
    let role: ProfileRole = "user";
    if (digRole) {
      role = parseRole(digRole);
    } else if (sql) {
      const [profile] = await sql<{ role: ProfileRole }[]>`
        SELECT role FROM public.profiles WHERE id = ${digUser}::uuid
      `;
      if (profile) role = profile.role;
    }
    return {
      id: digUser,
      role,
      emailVerified: true,
    };
  }
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!token || !supabaseUrl || !anonKey || !sql) return null;
  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  const [profile] = await sql<{ role: ProfileRole }[]>`
    SELECT role FROM public.profiles WHERE id = ${data.user.id}::uuid
  `;
  return {
    id: data.user.id,
    role: profile?.role ?? "user",
    emailVerified: Boolean(data.user.email_confirmed_at),
  };
};

const app = createApp({ sql, authenticate, objectStore, artifacts, config });

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`${config.brandName} API listening on http://localhost:${info.port}`);
});

function parseRole(value: string | undefined): ProfileRole {
  if (
    value === "moderator" ||
    value === "senior_moderator" ||
    value === "admin"
  ) {
    return value;
  }
  return "user";
}

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
