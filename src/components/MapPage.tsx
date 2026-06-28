import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { Issue } from "../types";
import { query, collection, onSnapshot, orderBy } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { MapPin, SlidersHorizontal, Eye } from "lucide-react";
import { getPendingDaysInfo } from "../utils";

export default function MapPage() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<{ [id: string]: L.Marker }>({});

  // Real-time Firestore sync
  useEffect(() => {
    const q = query(collection(db, "issues"), orderBy("createdAt", "desc"));
    
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const issuesData: Issue[] = [];
        snapshot.forEach((doc) => {
          issuesData.push(doc.data() as Issue);
        });
        setIssues(issuesData);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "issues");
      }
    );

    return () => unsubscribe();
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    // Use default coordinates (centered roughly in standard populated zones or first issue)
    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
    }).setView([37.7749, -122.4194], 12);
    
    mapInstanceRef.current = map;

    // Standard high-quality light map tiles
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);

    // Reposition zoom controls
    L.control.zoom({ position: "bottomright" }).addTo(map);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Sync Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || issues.length === 0) return;

    // Clear existing markers
    (Object.values(markersRef.current) as L.Marker[]).forEach((marker) => marker.remove());
    markersRef.current = {};

    // Custom CSS-based divIcon creator
    const createMarkerIcon = (severity: "low" | "medium" | "high") => {
      const colors = {
        high: "#ef4444",   // Red
        medium: "#f59e0b", // Amber
        low: "#10b981",    // Emerald
      };
      const color = colors[severity] || "#6b7280";

      return L.divIcon({
        className: "custom-div-icon",
        html: `
          <div class="flex items-center justify-center w-8 h-8 rounded-full bg-white dark:bg-[#1f1f3a] shadow-lg border-2 animate-fade-in" style="border-color: ${color};">
            <div class="w-3.5 h-3.5 rounded-full" style="background-color: ${color};"></div>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
    };

    // Calculate bounds to fit all markers
    const group = new L.FeatureGroup();

    issues.forEach((issue) => {
      if (typeof issue.latitude !== "number" || typeof issue.longitude !== "number") return;

      const marker = L.marker([issue.latitude, issue.longitude], {
        icon: createMarkerIcon(issue.severity),
      }).addTo(map);

      const pendingInfo = getPendingDaysInfo(issue.createdAt);

      // Create rich custom html popup
      const popupContent = `
        <div class="p-3 font-sans max-w-[240px] leading-snug dark:text-slate-200">
          <div class="relative w-full h-24 mb-2 overflow-hidden rounded-lg">
            <img src="${issue.imageUrl}" class="object-cover w-full h-full" />
          </div>
          <h4 class="font-bold text-slate-800 dark:text-slate-100 text-sm mb-1">${issue.title}</h4>
          <div class="flex items-center space-x-1.5 mb-2">
            <span class="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
              issue.category === 'public infrastructure'
                ? 'bg-blue-50 text-blue-700 border border-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/30'
                : 'bg-green-50 text-green-700 border border-green-100 dark:bg-green-950/40 dark:text-green-400 dark:border-green-900/30'
            }">${issue.category}</span>
            <span class="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded text-white bg-slate-500 dark:bg-slate-600">${issue.status}</span>
          </div>
          <!-- Pending resolution timer badge -->
          <div class="mb-2">
            <span class="inline-block text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${pendingInfo.className}">
              ⏱️ ${pendingInfo.text}
            </span>
          </div>
          <p class="text-[10px] text-slate-450 dark:text-slate-400 mb-1 font-mono">${issue.latitude.toFixed(5)}, ${issue.longitude.toFixed(5)}</p>
          <p class="text-[10px] text-slate-600 dark:text-slate-400 font-medium">Routed: ${issue.department}</p>
        </div>
      `;

      marker.bindPopup(popupContent, {
        closeButton: false,
        className: "custom-leaflet-popup",
      });

      marker.on("click", () => {
        setSelectedIssue(issue);
      });

      group.addLayer(marker);
      markersRef.current[issue.id] = marker;
    });

    // Fit map bounds to show all pins if we have coordinates
    if (issues.length > 0) {
      try {
        const bounds = group.getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
        }
      } catch (e) {
        console.error("Error setting map bounds:", e);
      }
    }
  }, [issues]);

  const focusOnIssue = (issue: Issue) => {
    setSelectedIssue(issue);
    const map = mapInstanceRef.current;
    if (map) {
      map.setView([issue.latitude, issue.longitude], 15);
      const marker = markersRef.current[issue.id];
      if (marker) {
        marker.openPopup();
      }
    }
  };

  const getSeverityStyle = (sev: string) => {
    switch (sev) {
      case "high":
        return "bg-red-50 text-red-700 border border-red-100 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900/30";
      case "medium":
        return "bg-yellow-50 text-yellow-700 border border-yellow-100 dark:bg-yellow-950/40 dark:text-yellow-400 dark:border-yellow-900/30";
      case "low":
        return "bg-green-50 text-green-700 border border-green-100 dark:bg-green-950/40 dark:text-green-400 dark:border-green-900/30";
      default:
        return "bg-slate-50 text-slate-700 border border-slate-200 dark:bg-[#1a1a2e] dark:text-slate-300 dark:border-slate-800";
    }
  };

  return (
    <div id="map-view-container" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col h-[calc(100vh-6rem)]">
      <div className="mb-4">
        <h1 className="font-display font-bold text-3xl text-slate-800 dark:text-slate-100 tracking-tight">Interactive Map</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm font-medium">Visualize reported incidents across the municipality color-coded by hazard severity.</p>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center flex-1 bg-white dark:bg-[#1f1f3a] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
          <div className="animate-spin text-green-600 dark:text-green-400 h-8 w-8 mb-4 border-2 border-green-600 dark:border-green-400 border-t-transparent rounded-full" />
          <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Loading Live Map Layers...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
          {/* List panel (1/3 width) */}
          <div className="lg:col-span-1 bg-white dark:bg-[#1f1f3a] border border-slate-200 dark:border-slate-800/80 rounded-2xl p-4 shadow-sm flex flex-col h-full min-h-0">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-3">
              <span className="font-display font-bold text-sm text-slate-800 dark:text-slate-100">Active Locations ({issues.length})</span>
              <div className="flex items-center space-x-1.5 text-xs text-slate-400 dark:text-slate-550 font-semibold">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>Scroll Selection</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {issues.length === 0 ? (
                <div className="text-center py-12 text-xs text-slate-400">
                  No issues registered on map yet.
                </div>
              ) : (
                issues.map((issue) => {
                  const pendingInfo = getPendingDaysInfo(issue.createdAt);
                  return (
                    <div
                      key={issue.id}
                      id={`map-list-item-${issue.id}`}
                      onClick={() => focusOnIssue(issue)}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition-all flex items-start space-x-3 ${
                        selectedIssue?.id === issue.id
                          ? "border-green-600 bg-green-50/50 dark:border-green-500 dark:bg-green-950/20"
                          : "border-slate-100 dark:border-slate-800/60 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50/50 dark:hover:bg-[#1a1a2e]/30"
                      }`}
                    >
                      <img
                        src={issue.imageUrl}
                        alt={issue.title}
                        className="w-12 h-12 rounded-lg object-cover bg-slate-50 dark:bg-[#1a1a2e] border border-slate-100 dark:border-slate-800"
                      />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-xs text-slate-800 dark:text-slate-100 truncate mb-0.5">{issue.title}</h4>
                        <div className="flex items-center space-x-1 mb-1">
                          <span className={`text-[9px] font-semibold px-1.5 py-0.25 rounded ${
                            issue.category === "public infrastructure"
                              ? "bg-blue-50 text-blue-700 border border-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/30"
                              : "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400"
                          }`}>
                            {issue.category}
                          </span>
                          <span className={`text-[9px] font-semibold px-1.5 py-0.25 rounded ${getSeverityStyle(issue.severity)}`}>
                            {issue.severity}
                          </span>
                          <span className={`text-[8px] font-bold px-1 py-0.25 rounded border ${pendingInfo.className}`}>
                            {pendingInfo.text}
                          </span>
                        </div>
                        <p className="text-[10px] font-mono text-slate-400 truncate">{issue.department}</p>
                      </div>
                      <button className="text-slate-400 hover:text-slate-700 p-1 rounded-lg self-center">
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Interactive Map (2/3 width) */}
          <div className="lg:col-span-2 relative h-[400px] lg:h-full bg-slate-100 border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            {/* Severity Legend */}
            <div className="absolute top-4 left-4 z-40 bg-white/95 dark:bg-[#1f1f3a]/95 backdrop-blur-sm border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-[#1a1a2e] rounded-xl p-3 flex flex-col space-y-1.5 text-[10px] font-semibold text-slate-700 dark:text-slate-200 font-sans">
              <span className="font-bold uppercase tracking-wider text-[9px] text-green-600 mb-0.5">Severity Legend</span>
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                <span>High Severity</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-500"></span>
                <span>Medium Severity</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
                <span>Low Severity</span>
              </div>
            </div>

            {/* Map Canvas */}
            <div ref={mapContainerRef} className="w-full h-full z-10" />
          </div>
        </div>
      )}
    </div>
  );
}
