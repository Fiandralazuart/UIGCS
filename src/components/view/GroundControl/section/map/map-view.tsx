"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useGroundControl } from "../../useGroundControl";
import { FlightInstrument } from "./flight-instrument";
import { FlightStatBar } from "./flight-stat-bar";
import { AltitudePanel, EkfPanel, ImuBaroPanel, MotorPanel, PidPanel } from "./flight-data-panels";
import type { MapWaypoint } from "./leaflet-map";

// Leaflet pakai `window`/DOM langsung saat modulnya di-import -- next/dynamic
// dengan ssr:false memastikan komponen ini TIDAK PERNAH dirender di server
// sama sekali (bukan cuma di dalam useEffect), menghindari error render SSR.
const LeafletMap = dynamic(
  () => import("./leaflet-map").then((m) => m.LeafletMap),
  { ssr: false },
);

// Polling mission.yaml (lewat /api/mission/waypoints, endpoint yang sama
// dipakai mission-panel.tsx) supaya marker WP di peta ini otomatis ikut
// ter-update begitu ada Ambil WP/Tambah WP/Delete WP/Save dari panel
// WAYPOINT COORDINATE -- TIDAK perlu state global/context tambahan, cukup
// baca ulang file yang sama secara independen.
const WAYPOINTS_POLL_MS = 3000;

interface RecordedRow {
  isoTime: string;
  rollDeg: number | null;
  pitchDeg: number | null;
  yawDeg: number | null;
  localX: number | null;
  localY: number | null;
  localZ: number | null;
  lat: number | null;
  lon: number | null;
  alt: number | null;
}

function downloadCsv(rows: RecordedRow[]) {
  const header =
    "timestamp,roll_deg,pitch_deg,yaw_deg,local_x_m,local_y_m,local_z_m,lat,lon,alt_m\n";
  const body = rows
    .map((r) =>
      [
        r.isoTime,
        r.rollDeg,
        r.pitchDeg,
        r.yawDeg,
        r.localX,
        r.localY,
        r.localZ,
        r.lat,
        r.lon,
        r.alt,
      ]
        .map((v) => (v === null ? "" : v))
        .join(","),
    )
    .join("\n");
  const blob = new Blob([header + body], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `orientasi_translasi_${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function MapView() {
  const { telemetry, connStatus } = useGroundControl();
  const [follow, setFollow] = useState(true);
  const [recording, setRecording] = useState(false);
  const [recordedCount, setRecordedCount] = useState(0);
  const rowsRef = useRef<RecordedRow[]>([]);
  const [mapWaypoints, setMapWaypoints] = useState<MapWaypoint[]>([]);

  const lat = telemetry.globalPose?.lat ?? null;
  const lon = telemetry.globalPose?.lon ?? null;
  const heading = telemetry.vfrHud?.heading ?? null;

  const refreshMapWaypoints = useCallback(async () => {
    try {
      const res = await fetch("/api/mission/waypoints");
      if (!res.ok) return;
      const data = await res.json();
      if (!data.ok) return;
      type ApiWaypoint = {
        index: string;
        type: string;
        hold: string;
        alt: string;
        batch: string;
        gripper: "OPEN" | "CLOSE";
        land: boolean;
        speed: string;
        lon: string;
        lat: string;
      };
      const parsed: MapWaypoint[] = (data.waypoints as ApiWaypoint[])
        .map((wp) => ({
          index: wp.index,
          type: wp.type,
          lat: Number(wp.lat),
          lon: Number(wp.lon),
          alt: wp.alt,
          hold: wp.hold,
          batch: wp.batch,
          speed: wp.speed,
          gripper: wp.gripper,
          land: wp.land,
        }))
        .filter((wp) => Number.isFinite(wp.lat) && Number.isFinite(wp.lon));
      setMapWaypoints(parsed);
    } catch {
      // polling berikutnya coba lagi -- tidak perlu tampilkan error di sini,
      // panel WAYPOINT COORDINATE sudah punya banner error sendiri untuk ini.
    }
  }, []);

  // setTimeout(fn, 0) untuk initial fetch (pola established di
  // useGroundControl.tsx) -- effect murni "subscribe ke polling", bukan
  // setState sinkron di badan effect.
  useEffect(() => {
    const initialTimer = setTimeout(refreshMapWaypoints, 0);
    const timer = setInterval(refreshMapWaypoints, WAYPOINTS_POLL_MS);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(timer);
    };
  }, [refreshMapWaypoints]);

  // Setiap kali telemetry ke-update (polling 1Hz dari useGroundControl) DAN
  // recording aktif -> tambah 1 baris (orientasi dari IMU aktual, translasi
  // dari local pose NED + global lat/lon/alt). Direkam di ref (bukan
  // state) supaya tidak memicu render ulang tiap baris -- cuma
  // recordedCount yang di-render buat indikator jumlah baris.
  useEffect(() => {
    if (!recording) return;
    rowsRef.current.push({
      isoTime: new Date().toISOString(),
      rollDeg: telemetry.imu?.rollDeg ?? null,
      pitchDeg: telemetry.imu?.pitchDeg ?? null,
      yawDeg: telemetry.imu?.yawDeg ?? null,
      localX: telemetry.localPose?.x ?? null,
      localY: telemetry.localPose?.y ?? null,
      localZ: telemetry.localPose?.z ?? null,
      lat: telemetry.globalPose?.lat ?? null,
      lon: telemetry.globalPose?.lon ?? null,
      alt: telemetry.globalPose?.alt ?? null,
    });
    setRecordedCount(rowsRef.current.length);
  }, [telemetry, recording]);

  const toggleRecording = () => {
    if (recording) {
      setRecording(false);
      if (rowsRef.current.length > 0) {
        downloadCsv(rowsRef.current);
      }
      rowsRef.current = [];
      setRecordedCount(0);
    } else {
      rowsRef.current = [];
      setRecordedCount(0);
      setRecording(true);
    }
  };

  const connected = connStatus === "connected";

  return (
    <div className="space-y-4">
      <Card className="flex flex-row items-center gap-3 border-slate-200 bg-white p-3 shadow-sm">
        <MapPin size={16} className="shrink-0 text-cyan-600" />
        <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-mono text-[9px] font-bold text-amber-700">
          {mapWaypoints.length} WP
        </span>
        <span className="min-w-0 flex-1 truncate text-center text-[12px] font-black tracking-wide text-slate-700">
          MAP & ORIENTASI DRONE
        </span>
      </Card>

      {/* "isolate" -- BUKAN cuma "relative overflow-hidden" -- WAJIB supaya
          Card ini bikin stacking context BARU. Tanpa "isolate", z-index di
          dalam sini (z-[1000], buat menang lawan panes internal Leaflet)
          "bocor" ke stacking context ROOT halaman, jadi menang juga lawan
          Header yang cuma z-50 -- widget instrumen kelihatan "menembus"
          ke atas Header saat discroll (TERBUKTI kejadian nyata, dilaporkan
          user 2026-09-14). Dengan "isolate", z-[1000] di dalam sini TIDAK
          PERNAH bisa keluar dari batas Card ini sama sekali. */}
      <Card className="relative isolate h-[520px] overflow-hidden border-slate-200 p-0 shadow-sm">
        <LeafletMap
          lat={lat}
          lon={lon}
          headingDeg={heading}
          follow={follow}
          waypoints={mapWaypoints}
        />
        {/* "Following" dipindah ke DALAM peta (2026-09-15, atas permintaan
            user) -- floating di pojok kiri atas, di bawah tombol zoom
            bawaan Leaflet (topleft) supaya tidak tumpang tindih. Warna
            SENGAJA solid gelap (bukan putih) -- putih polos di atas tile
            peta (yang seringkali juga terang) bikin tombol+teksnya nyaris
            tidak kelihatan (dilaporkan user 2026-09-15). */}
        <div className="pointer-events-none absolute left-3 top-[92px] z-[1000]">
          <Button
            size="sm"
            onClick={() => setFollow((v) => !v)}
            className={`pointer-events-auto h-8 border text-[9px] font-bold text-white shadow-md ${
              follow
                ? "border-cyan-400 bg-cyan-600 hover:bg-cyan-700"
                : "border-slate-600 bg-slate-800 hover:bg-slate-700"
            }`}
          >
            {follow ? "Following" : "Follow: Off"}
          </Button>
        </div>
        {/* Instrumen gaya QGC, floating di pojok kanan atas peta -- pola
            sama seperti QGroundControl's flight instrument HUD. */}
        <div className="pointer-events-none absolute right-3 top-3 z-[1000] flex flex-col items-center gap-2">
          <FlightInstrument
            rollDeg={telemetry.imu?.rollDeg ?? null}
            pitchDeg={telemetry.imu?.pitchDeg ?? null}
            headingDeg={heading}
          />
          <FlightStatBar telemetry={telemetry} />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <PidPanel
          telemetry={telemetry}
          recording={recording}
          recordedCount={recordedCount}
          onToggleRecording={toggleRecording}
          disabled={!connected}
        />
        <MotorPanel telemetry={telemetry} />
        <EkfPanel telemetry={telemetry} />
        <ImuBaroPanel telemetry={telemetry} />
        <AltitudePanel telemetry={telemetry} />
      </div>
    </div>
  );
}
