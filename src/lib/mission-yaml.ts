// Parser murni (tidak ada dependency yaml library) untuk
// masterpiece_ws/src/waypoint_mission/config/mission.yaml -- raspi adalah
// source of truth (lihat memory feedback_masterpiecews_raspi_source_of_truth).
//
// Mission panel di web SEBELUMNYA cuma menampilkan array mockup lokal
// (lihat riwayat mission-panel.tsx) -- ini menggantinya dengan pembacaan
// REAL dari file itu lewat SSH (lihat getMissionYaml() di ssh-manager.ts),
// diparse di sini dengan logika yang MENIRU persis Utils/waypoint.h
// (parse_waypoint()/parse_batches()) di masterpiece_ws, supaya angka yang
// tampil di web sama dengan yang benar-benar dieksekusi mission_node.cpp.
//
// Field per waypoint (lihat komentar mission.yaml & waypoint.h):
//   "lat,lon,alt,AMSL|REL_HOME|TERRAIN,yaw,hold[,FLY_THROUGH|STOP[,none|open[,speed_mps]]]"
//
// Catatan penyederhanaan yang SENGAJA dilakukan (bukan bug):
// - Label "batch" yang ditampilkan diambil APA ADANYA dari angka setelah
//   kata "BATCH" di baris komentar penanda (mis. "# === BATCH 2 ===" -> "2"),
//   BUKAN nomor urut grup internal parse_batches() -- kalau operator menulis
//   ulang label yang sama (seperti "BATCH 2" muncul dua kali di file nyata),
//   mission_node.cpp tetap memperlakukannya sebagai DUA sesi terpisah secara
//   runtime, tapi kita tampilkan label mentahnya karena itu yang ditulis
//   manusia dan lebih mudah dikenali di web (bukan untuk re-implementasi
//   penuh mekanisme sesi speed/alt).
// - "speed" & "alt" efektif per-WP dihitung dengan carry-forward yang sama
//   seperti dijelaskan di waypoint.h (override WP > override batch > global),
//   supaya lebih dekat ke nilai yang benar-benar dipakai saat terbang.
export interface Waypoint {
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
}

export interface ParsedMission {
  waypoints: Waypoint[];
  flightSpeedMps: number | null;
}

interface RawWaypoint {
  lat: number;
  lon: number;
  altM: number;
  holdS: number;
  gripperOpen: boolean;
  speedOverride: number | null;
}

function parseWaypointLine(quoted: string): RawWaypoint | null {
  const fields = quoted.split(",").map((f) => f.trim());
  if (fields.length < 6) return null;
  const lat = Number(fields[0]);
  const lon = Number(fields[1]);
  const altM = Number(fields[2]);
  const holdS = Number(fields[5]);
  if ([lat, lon, altM, holdS].some((n) => Number.isNaN(n))) return null;
  const gripperField = (fields[7] ?? "").toLowerCase();
  const gripperOpen = gripperField === "open";
  let speedOverride: number | null = null;
  if (fields.length >= 9 && fields[8]) {
    const parsed = Number(fields[8]);
    if (Number.isFinite(parsed) && parsed > 0) speedOverride = parsed;
  }
  return { lat, lon, altM, holdS, gripperOpen, speedOverride };
}

export function parseMissionYaml(text: string): ParsedMission {
  const globalSpeedMatch = text.match(/flight_speed_mps:\s*([0-9.]+)/);
  const flightSpeedMps = globalSpeedMatch ? Number(globalSpeedMatch[1]) : null;

  type BatchMarker = { label: string; speedOverride: number | null; altOverride: number | null };
  let currentBatch: BatchMarker | null = null;
  const rawWaypoints: RawWaypoint[] = [];
  const batchLabelByIndex: string[] = [];
  const batchSpeedOverrideByIndex: (number | null)[] = [];
  const batchAltOverrideByIndex: (number | null)[] = [];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("- \"") && line.endsWith("\"")) {
      const quoted = line.slice(3, -1);
      const wp = parseWaypointLine(quoted);
      if (wp) {
        rawWaypoints.push(wp);
        batchLabelByIndex.push(currentBatch?.label ?? "1");
        batchSpeedOverrideByIndex.push(currentBatch?.speedOverride ?? null);
        batchAltOverrideByIndex.push(currentBatch?.altOverride ?? null);
      }
      continue;
    }
    if (line.startsWith("#") && /batch/i.test(line)) {
      const labelMatch = line.match(/batch\s*(\d+)/i);
      const speedMatch = line.match(/speed\s*=\s*([0-9.]+)/i);
      const altMatch = line.match(/alt\s*=\s*([0-9.]+)/i);
      currentBatch = {
        label: labelMatch ? labelMatch[1] : String((currentBatch ? Number(currentBatch.label) : 0) + 1),
        speedOverride: speedMatch ? Number(speedMatch[1]) : null,
        altOverride: altMatch ? Number(altMatch[1]) : null,
      };
    }
  }

  let effectiveSpeed = flightSpeedMps ?? NaN;
  const waypoints: Waypoint[] = rawWaypoints.map((wp, i) => {
    const batchSpeedOverride = batchSpeedOverrideByIndex[i];
    if (batchSpeedOverride !== null) effectiveSpeed = batchSpeedOverride;
    if (wp.speedOverride !== null) effectiveSpeed = wp.speedOverride;
    const batchAltOverride = batchAltOverrideByIndex[i];
    const effectiveAlt = batchAltOverride !== null ? batchAltOverride : wp.altM;
    const isFirst = i === 0;
    const isLast = i === rawWaypoints.length - 1;
    return {
      index: String(i + 1).padStart(2, "0"),
      type: isFirst ? "TAKEOFF" : "WAYPOINT",
      hold: wp.holdS.toFixed(3),
      alt: effectiveAlt.toFixed(3),
      batch: batchLabelByIndex[i],
      gripper: wp.gripperOpen ? "OPEN" : "CLOSE",
      land: isLast,
      speed: Number.isFinite(effectiveSpeed) ? effectiveSpeed.toFixed(2) : "--",
      lon: wp.lon.toFixed(8),
      lat: wp.lat.toFixed(8),
    };
  });

  return { waypoints, flightSpeedMps };
}
