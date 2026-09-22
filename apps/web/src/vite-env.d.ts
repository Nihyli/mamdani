/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** primary | fallback — selects brand from packages/contracts */
  readonly VITE_BRAND?: string;
  readonly VITE_MAP_STYLE_URL?: string;
  readonly VITE_MAP_TILE_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_ALLOW_DEV_AUTH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
