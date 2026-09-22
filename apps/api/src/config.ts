import { disclaimerFor, resolveBrand } from "@mamdani-ticketer/contracts";

export type ApiConfig = {
  port: number;
  corsOrigins: string[];
  dailyReviewCapacity: number;
  bbox: { minLng: number; maxLng: number; minLat: number; maxLat: number };
  publicUploadBaseUrl: string;
  publicAppUrl: string;
  uploadDir: string;
  objectStore: "filesystem" | "mock";
  allowDevAuth: boolean;
  brandName: string;
  disclaimer: string;
};

function num(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const origins = (env.CORS_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const brand = resolveBrand(env.BRAND);
  return {
    port: num(env.API_PORT, 8787),
    corsOrigins: origins,
    dailyReviewCapacity: num(env.DAILY_REVIEW_CAPACITY, 30),
    bbox: {
      minLng: num(env.NYC_LNG_MIN, -74.3),
      maxLng: num(env.NYC_LNG_MAX, -73.7),
      minLat: num(env.NYC_LAT_MIN, 40.4),
      maxLat: num(env.NYC_LAT_MAX, 40.95),
    },
    publicUploadBaseUrl: (
      env.PUBLIC_UPLOAD_BASE_URL ?? "http://localhost:8787/dev-uploads"
    ).replace(/\/$/, ""),
    publicAppUrl: (env.PUBLIC_APP_URL ?? "http://localhost:5173").replace(
      /\/$/,
      "",
    ),
    uploadDir: env.UPLOAD_DIR ?? ".uploads",
    objectStore: env.OBJECT_STORE === "mock" ? "mock" : "filesystem",
    allowDevAuth: env.ALLOW_DEV_AUTH === "true",
    brandName: env.BRAND_NAME?.trim() || brand.name,
    disclaimer: disclaimerFor(brand),
  };
}

export function insideNycBbox(
  longitude: number,
  latitude: number,
  bbox: ApiConfig["bbox"],
): boolean {
  return (
    longitude >= bbox.minLng &&
    longitude <= bbox.maxLng &&
    latitude >= bbox.minLat &&
    latitude <= bbox.maxLat
  );
}
