"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

// Leaflet butuh `window`/DOM -- import & init HANYA di dalam useEffect
// (client-only), TIDAK pernah di top-level module scope, supaya aman dari
// SSR (Next.js render server dulu sebelum hydration).
//
// Marker pakai DivIcon custom (segitiga CSS diputar sesuai heading), BUKAN
// icon PNG default Leaflet -- icon default itu terkenal rusak di bundler
// modern (webpack/Turbopack tidak resolve path asset-nya dengan benar
// tanpa konfigurasi tambahan), jadi disini dihindari sama sekali.

// Data WP yang ditampilkan di peta -- SAMA PERSIS field yang dibaca
// mission-panel.tsx dari /api/mission/waypoints (mission.yaml REAL di
// raspi, lihat mission-yaml.ts), supaya "semua data koordinat WPC" yang
// ditampilkan di sini konsisten dengan panel WAYPOINT COORDINATE.
export interface MapWaypoint {
  index: string;
  type: string;
  lat: number;
  lon: number;
  alt: string;
  hold: string;
  batch: string;
  speed: string;
  gripper: string;
  land: boolean;
}

export function LeafletMap({
  lat,
  lon,
  headingDeg,
  follow,
  waypoints,
}: {
  lat: number | null;
  lon: number | null;
  headingDeg: number | null;
  follow: boolean;
  waypoints?: MapWaypoint[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markerRef = useRef<import("leaflet").Marker | null>(null);
  const wpLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  // Bump begitu peta selesai di-init (async, lihat effect di bawah) supaya
  // effect penggambar marker WP (yang butuh mapRef.current sudah terisi)
  // ikut jalan ulang tanpa perlu menunggu lat/lon berubah dulu.
  const [mapReadyTick, setMapReadyTick] = useState(0);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, {
        center: [lat ?? -7.2575, lon ?? 112.7521],
        // zoom 20 -- skala peta jadi ~5m per segmen scale bar (diminta
        // user 2026-09-14). OSM tile server aslinya cuma nyedia sampai z19
        // (maxNativeZoom di bawah) -- tile z19 di-upscale Leaflet sendiri
        // buat zoom 20-22, sedikit blur tapi tetap kepakai buat referensi
        // posisi presisi tinggi, jauh lebih baik daripada dibatasi z19.
        zoom: 20,
      });
      // 2026-09-16 (atas permintaan user, "map auto download apakah
      // bisa") -- tile OSM di-cache ke IndexedDB browser lewat
      // leaflet.offline, DUA mekanisme sekaligus:
      //  1. Auto-save PASIF: tiap tile yang berhasil dimuat dari network
      //     (bukan dari cache) otomatis disimpan (listener 'tileload' di
      //     bawah) -- area yang PERNAH dibuka otomatis tersedia offline
      //     nanti, tanpa aksi tambahan apa pun.
      //  2. Tombol "Save tiles" eksplisit (ControlSaveTiles, pojok kanan
      //     bawah peta) -- unduh SEMUA tile dalam batas layar saat ini
      //     (beberapa level zoom sekaligus) sebelum berangkat ke
      //     lapangan, tidak perlu geser-geser peta manual dulu satu-satu.
      // tileLayerOffline (bukan L.tileLayer biasa) -- createTile()-nya
      // otomatis cek cache dulu sebelum fetch network, exact drop-in
      // pengganti tileLayer.
      const { tileLayerOffline, savetiles, hasTile, downloadTile, saveTile } = await import(
        "leaflet.offline"
      );
      const tileUrlTemplate = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
      const offlineLayer = tileLayerOffline(tileUrlTemplate, {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 22,
        maxNativeZoom: 19,
      });
      offlineLayer.addTo(map);
      offlineLayer.on(
        "tileload",
        (event: { coords: { x: number; y: number; z: number }; tile: HTMLImageElement }) => {
          const key = event.tile.src;
          // src-nya SUDAH jadi blob: URL kalau tadi dimuat dari cache
          // (getTileImageSource di leaflet.offline) -- cuma tile yang
          // BENERAN baru dari network (src http/https asli) yang perlu
          // disimpan di sini, hindari nyimpen ulang yang sudah ke-cache.
          if (!key.startsWith("http")) return;
          hasTile(key)
            .then((already: boolean) => {
              if (already) return;
              downloadTile(key)
                .then((blob: Blob) =>
                  saveTile(
                    {
                      key,
                      url: key,
                      urlTemplate: tileUrlTemplate,
                      x: event.coords.x,
                      y: event.coords.y,
                      z: event.coords.z,
                      createdAt: Date.now(),
                    },
                    blob,
                  ),
                )
                .catch(() => {
                  // Offline/gagal simpan -- diamkan, tile tetap kepakai
                  // buat sesi ini, cuma tidak ke-cache buat sesi berikutnya.
                });
            })
            .catch(() => {});
        },
      );
      savetiles(offlineLayer, {
        position: "bottomleft",
        saveText: "⬇ Save tiles",
        rmText: "✕ Hapus cache",
        maxZoom: 19,
        saveWhatYouSee: true,
        bounds: null,
        confirm: null,
        confirmRemoval: null,
        parallel: 4,
        alwaysDownload: false,
      }).addTo(map);
      L.control.scale({ metric: true, imperial: false, maxWidth: 100 }).addTo(map);
      mapRef.current = map;
      setMapReadyTick((t) => t + 1);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
      wpLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current || lat === null || lon === null) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapRef.current) return;
      const rotation = headingDeg ?? 0;
      const icon = L.divIcon({
        className: "",
        html: `<div style="transform: rotate(${rotation}deg); width:22px; height:22px; display:flex; align-items:center; justify-content:center;">
          <div style="width:0; height:0; border-left:7px solid transparent; border-right:7px solid transparent; border-bottom:16px solid #0ea5e9; filter: drop-shadow(0 0 2px rgba(0,0,0,0.4));"></div>
        </div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      if (!markerRef.current) {
        markerRef.current = L.marker([lat, lon], { icon }).addTo(mapRef.current);
      } else {
        markerRef.current.setLatLng([lat, lon]);
        markerRef.current.setIcon(icon);
      }
      if (follow) {
        mapRef.current.panTo([lat, lon], { animate: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lat, lon, headingDeg, follow]);

  // Marker + garis rute untuk SEMUA WP dari mission.yaml (bukan cuma
  // posisi drone) -- diminta user 2026-09-15: "connectkan semua data
  // koordinat wpc ditampilkan di map". Layer digambar ulang dari nol tiap
  // kali `waypoints` berubah (list biasanya pendek, <30 item, jadi murah)
  // supaya penambahan/penghapusan/edit WP di panel WAYPOINT COORDINATE
  // langsung tercermin di peta tanpa perlu diff manual per-marker.
  useEffect(() => {
    if (!mapRef.current) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapRef.current) return;
      wpLayerRef.current?.remove();
      wpLayerRef.current = null;
      if (!waypoints || waypoints.length === 0) return;

      const layer = L.layerGroup();
      const latLngs: [number, number][] = waypoints.map((wp) => [wp.lat, wp.lon]);
      L.polyline(latLngs, { color: "#f59e0b", weight: 2, dashArray: "6 6", opacity: 0.8 }).addTo(
        layer,
      );
      for (const wp of waypoints) {
        const isTakeoff = wp.type === "TAKEOFF";
        const color = wp.land ? "#dc2626" : isTakeoff ? "#16a34a" : "#0ea5e9";
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:20px; height:20px; border-radius:9999px; background:${color}; border:2px solid white; box-shadow:0 0 3px rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; font:700 10px/1 monospace; color:white;">${wp.index}</div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        });
        L.marker([wp.lat, wp.lon], { icon })
          .bindPopup(
            `<div style="font:11px/1.5 monospace;">` +
              `<b>WP${wp.index}</b> (${wp.type})<br/>` +
              `LAT: ${wp.lat.toFixed(8)}<br/>` +
              `LON: ${wp.lon.toFixed(8)}<br/>` +
              `ALT: ${wp.alt} m &middot; HOLD: ${wp.hold} s<br/>` +
              `BATCH: ${wp.batch} &middot; SPEED: ${wp.speed} m/s<br/>` +
              `GRIPPER: ${wp.gripper}${wp.land ? " &middot; LAND" : ""}` +
              `</div>`,
          )
          .addTo(layer);
      }
      layer.addTo(mapRef.current);
      wpLayerRef.current = layer;
    })();
    return () => {
      cancelled = true;
    };
    // mapReadyTick sengaja jadi dependency -- effect ini butuh jalan ulang
    // begitu peta selesai di-init (mapRef.current baru terisi setelah efek
    // pertama selesai, async), bukan cuma saat `waypoints` berubah.
  }, [waypoints, mapReadyTick]);

  return <div ref={containerRef} className="h-full w-full rounded-lg" />;
}
