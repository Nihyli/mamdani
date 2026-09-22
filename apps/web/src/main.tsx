import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import "./index.css";
import App from "./App";

// Register once for local/R2 PMTiles basemaps (SPEC §6).
const pmtiles = new Protocol();
maplibregl.addProtocol("pmtiles", pmtiles.tile);

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
