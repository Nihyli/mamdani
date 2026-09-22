import { useEffect, useRef } from "react";
import maplibregl, { type GeoJSONSource, type Map } from "maplibre-gl";
import type { PublicIssueListItem } from "@mamdani-ticketer/contracts";
import { getMapStyle, NYC_CENTER, NYC_ZOOM } from "../lib/map-style";
import { isPublicMapStatus } from "../lib/labels";

type Props = {
  issues: PublicIssueListItem[];
  selectedId?: string;
  onSelect: (id: string) => void;
  interactivePin?: {
    longitude: number;
    latitude: number;
  } | null;
  onPinMove?: (lng: number, lat: number) => void;
  className?: string;
};

function statusColor(status: string): string {
  if (status === "resolved") return "#2F7A4A";
  if (status === "fix_pending") return "#C4891A";
  return "#C94C3D";
}

export function MapView({
  issues,
  selectedId,
  onSelect,
  interactivePin,
  onPinMove,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const pinMarkerRef = useRef<maplibregl.Marker | null>(null);
  const onSelectRef = useRef(onSelect);
  const onPinMoveRef = useRef(onPinMove);
  onSelectRef.current = onSelect;
  onPinMoveRef.current = onPinMove;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyle(),
      center: NYC_CENTER,
      zoom: NYC_ZOOM,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    map.on("load", () => {
      map.addSource("issues", {
        type: "geojson",
        data: emptyFc(),
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 48,
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "issues",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#255BDB",
          "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 30, 26],
          "circle-opacity": 0.85,
        },
      });

      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "issues",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 12,
        },
        paint: { "text-color": "#ffffff" },
      });

      map.addLayer({
        id: "unclustered",
        type: "circle",
        source: "issues",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            11,
            8,
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#F7F5EF",
        },
      });

      map.on("click", "clusters", (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
        const clusterId = features[0]?.properties?.cluster_id;
        const source = map.getSource("issues") as GeoJSONSource;
        if (clusterId == null) return;
        source
          .getClusterExpansionZoom(clusterId)
          .then((zoom) => {
            const geometry = features[0]?.geometry;
            if (geometry?.type !== "Point") return;
            map.easeTo({
              center: geometry.coordinates as [number, number],
              zoom,
            });
          })
          .catch(() => undefined);
      });

      map.on("click", "unclustered", (e) => {
        const id = e.features?.[0]?.properties?.id;
        if (typeof id === "string") onSelectRef.current(id);
      });

      map.on("mouseenter", "clusters", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "clusters", () => {
        map.getCanvas().style.cursor = "";
      });
      map.on("mouseenter", "unclustered", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "unclustered", () => {
        map.getCanvas().style.cursor = "";
      });
    });

    return () => {
      pinMarkerRef.current?.remove();
      pinMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const data: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: issues
        .filter((issue) => isPublicMapStatus(issue.status))
        .map((issue) => ({
          type: "Feature" as const,
          id: issue.id,
          properties: {
            id: issue.id,
            status: issue.status,
            color: statusColor(issue.status),
            selected: issue.id === selectedId,
          },
          geometry: {
            type: "Point" as const,
            coordinates: [issue.location.longitude, issue.location.latitude],
          },
        })),
    };

    const apply = () => {
      const source = map.getSource("issues") as GeoJSONSource | undefined;
      if (source) source.setData(data);
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);

    if (selectedId) {
      const selected = issues.find((i) => i.id === selectedId);
      if (selected) {
        map.easeTo({
          center: [selected.location.longitude, selected.location.latitude],
          zoom: Math.max(map.getZoom(), 14),
          duration: 500,
        });
      }
      for (const issue of issues) {
        try {
          map.setFeatureState(
            { source: "issues", id: issue.id },
            { selected: issue.id === selectedId },
          );
        } catch {
          /* source may not be ready */
        }
      }
    }
  }, [issues, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!interactivePin) {
      pinMarkerRef.current?.remove();
      pinMarkerRef.current = null;
      return;
    }

    const draggable = Boolean(onPinMove);
    const existing = pinMarkerRef.current;
    const dragModeChanged =
      existing != null &&
      (existing.isDraggable?.() ?? false) !== draggable;

    if (existing && !dragModeChanged) {
      existing.setLngLat([interactivePin.longitude, interactivePin.latitude]);
      return;
    }

    existing?.remove();
    pinMarkerRef.current = null;

    const el = document.createElement("div");
    el.className = "h-4 w-4 rounded-full border-2 border-white bg-cobalt shadow";
    el.setAttribute("aria-hidden", "true");
    const marker = new maplibregl.Marker({ element: el, draggable })
      .setLngLat([interactivePin.longitude, interactivePin.latitude])
      .addTo(map);
    map.easeTo({
      center: [interactivePin.longitude, interactivePin.latitude],
      zoom: Math.max(map.getZoom(), 14),
      duration: 400,
    });
    if (draggable) {
      marker.on("dragend", () => {
        const { lng, lat } = marker.getLngLat();
        onPinMoveRef.current?.(lng, lat);
      });
    }
    pinMarkerRef.current = marker;

    if (draggable) {
      const clickHandler = (e: maplibregl.MapMouseEvent) => {
        marker.setLngLat(e.lngLat);
        onPinMoveRef.current?.(e.lngLat.lng, e.lngLat.lat);
      };
      map.on("click", clickHandler);
      return () => {
        map.off("click", clickHandler);
      };
    }
  }, [interactivePin, onPinMove]);

  return (
    <div
      ref={containerRef}
      className={className ?? "h-full w-full"}
      role="application"
      aria-label="NYC issues map"
    />
  );
}

function emptyFc(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}
