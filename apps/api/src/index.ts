/**
 * Worker entry. The local process is `src/node.ts` (npm run dev).
 * Cloudflare still needs a Postgres connection (Hyperdrive or the service-role
 * URL). This export builds the same Hono app when those bindings exist.
 */
import postgres from "postgres";
import { createApp, type Authenticate } from "./app.js";
import { configFromEnv } from "./config.js";
import { MemoryArtifactStore } from "./lib/artifacts.js";
import { MemoryObjectStore } from "./object-store.js";

const config = configFromEnv();
const databaseUrl = process.env.DATABASE_URL;
const sql = databaseUrl ? postgres(databaseUrl, { max: 1, prepare: false }) : null;

const authenticate: Authenticate = async () => null;

const app = createApp({
  sql,
  authenticate,
  objectStore: new MemoryObjectStore(config.publicUploadBaseUrl),
  artifacts: new MemoryArtifactStore(config.publicApiBaseUrl),
  config,
});

export default app;
