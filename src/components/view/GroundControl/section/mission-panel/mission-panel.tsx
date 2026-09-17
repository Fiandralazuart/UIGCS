"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Crosshair,
  Hammer,
  Loader2,
  MapPin,
  Plus,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGroundControl } from "../../useGroundControl";
import { serviceDisplay } from "../service-status";
import { WaypointDetailModal, type Waypoint } from "./waypoint-detail-modal";

// Interval simulasi "WP terlewat" saat mission running -- TIDAK ada topic
// ROS2 real untuk progress per-WP yang di-wire ke sini (di luar lingkup
// permintaan), jadi status hijau/animasi murni visual berbasis timer lokal
// begitu status mission jadi "running".
const SIMULATED_ADVANCE_MS = 4000;

// Berapa lama animasi sukses/gagal AMBIL WP ditampilkan sebelum kembali ke
// tombol normal -- status mentahnya tetap tersimpan di server (polling),
// tapi tampilan "expired" murni dihitung dari timestamp di sini (tidak
// perlu round-trip lagi ke server buat "reset" animasinya).
const CAPTURE_ANIM_MS = 4000;

// Polling mission.yaml (2026-09-16) -- sama seperti map-view.tsx, supaya
// tabel WP/BATCH di sini ikut update kalau ada perubahan dari sumber LAIN
// (LCD fisik, dst), bukan cuma dari tombol di panel ini sendiri.
const WAYPOINTS_POLL_MS = 3000;

// Dipakai CaptureWpButton (per-baris "Ambil WP") untuk animasi
// capturing/success/error berbasis waypointCapture (status GPS). Date.now()
// dipanggil di dalam effect/interval (bukan langsung di body render) supaya
// tidak melanggar react-hooks/purity.
function useCaptureDisplay(index: number | null) {
  const { waypointCapture } = useGroundControl();
  const entry = index !== null ? waypointCapture[index] : undefined;
  const [expired, setExpired] = useState(true);

  useEffect(() => {
    if (!entry) {
      const resetTimer = setTimeout(() => setExpired(true), 0);
      return () => clearTimeout(resetTimer);
    }
    const check = () => setExpired(Date.now() - entry.ts > CAPTURE_ANIM_MS);
    const initialTimer = setTimeout(check, 0);
    const timer = setInterval(check, 1000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(timer);
    };
  }, [entry]);

  const display = !entry || (expired && entry.status !== "capturing") ? "idle" : entry.status;
  return { display, entry };
}

function CaptureWpButton({
  wp,
  disabled,
  onCapture,
}: {
  wp: Waypoint;
  disabled: boolean;
  onCapture: () => void;
}) {
  const { display, entry } = useCaptureDisplay(Number(wp.index));

  if (display === "capturing") {
    return (
      <Button size="sm" variant="outline" disabled className="h-6 px-2 text-[8px] font-bold">
        <Loader2 size={11} className="mr-1 animate-spin" />
        Mengambil...
      </Button>
    );
  }
  if (display === "success") {
    return (
      <Button size="sm" variant="outline" disabled className="h-6 border-green-200 bg-green-50 px-2 text-[8px] font-bold text-green-700">
        <CheckCircle2 size={11} className="mr-1" />
        Berhasil
      </Button>
    );
  }
  if (display === "error") {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={onCapture}
        title={entry?.message}
        className="h-6 border-red-200 bg-red-50 px-2 text-[8px] font-bold text-red-700 hover:bg-red-100"
      >
        <XCircle size={11} className="mr-1" />
        Gagal, ulangi
      </Button>
    );
  }
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={disabled}
      onClick={onCapture}
      className="h-6 px-2 text-[8px] font-bold"
      title="Ambil koordinat GPS live untuk WP ini (posisi drone SEKARANG) -- konsep sama seperti tombol AMBIL WP di LCD fisik"
    >
      <Crosshair size={11} className="mr-1" />
      Ambil WP
    </Button>
  );
}

// "Tambah WP" TIDAK mengambil GPS sama sekali (atas permintaan user) --
// cuma menyisipkan placeholder WP baru (lat/lon di-copy dari WP terakhir)
// lewat add_waypoint.py, jadi statusnya cukup loading/error LOKAL biasa
// (bukan animasi capturing/success ala GPS yang dipakai CaptureWpButton).
function AddWpButton({
  disabled,
  onAdd,
}: {
  disabled: boolean;
  onAdd: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setAdding(true);
    setError(null);
    try {
      await onAdd();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  };

  if (adding) {
    return (
      <Button disabled size="sm" variant="outline" className="h-9 text-[10px] font-bold">
        <Loader2 size={12} className="mr-1 animate-spin" />
        Menambah...
      </Button>
    );
  }
  if (error) {
    return (
      <Button
        onClick={handleClick}
        disabled={disabled}
        size="sm"
        variant="outline"
        title={error}
        className="h-9 border-red-200 bg-red-50 text-[10px] font-bold text-red-700 hover:bg-red-100"
      >
        <XCircle size={12} className="mr-1" />
        Gagal, ulangi
      </Button>
    );
  }
  return (
    <Button
      onClick={handleClick}
      disabled={disabled}
      size="sm"
      variant="outline"
      className="h-9 text-[10px] font-bold"
      title="Tambah WP baru placeholder (lat/lon di-copy dari WP terakhir, tanpa GPS) di akhir daftar"
    >
      <Plus size={12} className="mr-1" />
      Tambah WP
    </Button>
  );
}

// "Ambil WP1 Retry" (2026-09-16, web + LCD fisik/ui_ws) -- ambil ulang
// posisi GPS drone SEKARANG sebagai titik takeoff Retry Mission, ditulis
// ke WP1 mission_retry.yaml (BUKAN WP1 mission.yaml asli, TIDAK
// mempengaruhi Full Mission sama sekali). Animasi capturing/success/error
// PERSIS sama seperti CaptureWpButton (useCaptureDisplay dengan stateKey
// sentinel 0, lihat captureRetryWp1() di ssh-manager.ts).
function Wp1RetryButton({
  disabled,
  onCapture,
}: {
  disabled: boolean;
  onCapture: () => void;
}) {
  const { display, entry } = useCaptureDisplay(0);

  if (display === "capturing") {
    return (
      <Button size="sm" variant="outline" disabled className="h-8 text-[9px] font-bold">
        <Loader2 size={12} className="mr-1 animate-spin" />
        Mengambil...
      </Button>
    );
  }
  if (display === "success") {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled
        className="h-8 border-green-200 bg-green-50 text-[9px] font-bold text-green-700"
      >
        <CheckCircle2 size={12} className="mr-1" />
        Berhasil
      </Button>
    );
  }
  if (display === "error") {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={onCapture}
        title={entry?.message}
        className="h-8 border-red-200 bg-red-50 text-[9px] font-bold text-red-700 hover:bg-red-100"
      >
        <XCircle size={12} className="mr-1" />
        Gagal, ulangi
      </Button>
    );
  }
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={disabled}
      onClick={onCapture}
      className="h-8 border-amber-200 bg-amber-50 text-[9px] font-bold text-amber-700 hover:bg-amber-100"
      title="Ambil posisi GPS drone SEKARANG sebagai titik takeoff Retry Mission -- params (hold/speed/alt/gripper) sama seperti WP1 asli, cuma koordinat & file target yang beda (mission_retry.yaml)"
    >
      <Crosshair size={12} className="mr-1" />
      Ambil WP1 Retry
    </Button>
  );
}

export function MissionPanel() {
  const {
    services,
    connStatus,
    startService,
    stopService,
    sendMissionAccept,
    missionBuildStatus,
    buildMission,
    captureWaypoint,
    waypointCapture,
    addWaypoint,
    resetAllWaypoints,
    buildRetryMission,
    captureRetryWp1,
    telemetry,
  } = useGroundControl();
  const { status } = services.mission;
  const display = serviceDisplay(status);
  const connected = connStatus === "connected";
  const running = status === "running";
  // 2026-09-16 (atas permintaan user, bug "animasi mulai duluan tidak
  // ngikutin takeoff/terbang drone"): `running` cuma berarti proses
  // mission_node.cpp SUDAH JALAN -- masih ada fase panjang sebelum
  // benar-benar terbang mission (OFFBOARD hold, tunggu keypress "1", arm,
  // climb manual, baru setMode AUTO.MISSION -- lihat mission_node.cpp).
  // missionExecuting = data ASLI dari FCU (telemetry.state, via MAVROS)
  // yang cuma true SETELAH drone benar-benar armed DAN mode-nya sudah
  // AUTO.MISSION -- dipakai buat gate animasi status WP di bawah, BUKAN
  // `running` mentah lagi.
  const missionExecuting =
    running && Boolean(telemetry.state?.armed) && telemetry.state?.mode === "AUTO.MISSION";
  const building = missionBuildStatus === "building";
  const anyCapturing = Object.values(waypointCapture).some((e) => e.status === "capturing");

  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [activeWpIndex, setActiveWpIndex] = useState(0);
  const [modalWp, setModalWp] = useState<Waypoint | null>(null);
  // "Reset" (2026-09-16) -- fungsi SAMA seperti RESET di LCD fisik
  // (ui_ws): kosongkan SELURUH waypoint. Destruktif -- pola konfirmasi
  // dua-klik SAMA seperti Delete WP di waypoint-detail-modal.tsx.
  const [resetConfirming, setResetConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Switch mode mission (2026-09-15 UI, di-wire ke command 2026-09-16,
  // DIREVISI 2026-09-16 atas permintaan user) -- "Full Mission" = default,
  // jalan 03_mission.launch.xml apa adanya (tidak berubah). "Retry
  // Mission" = pilih BATCH target, lalu mission_retry.yaml dibangun ULANG
  // dari mission.yaml TERBARU (WP1 + batch itu, label marker batch
  // dipertahankan apa adanya) sesaat sebelum mission dijalankan lewat
  // config:=mission_retry.yaml -- lihat buildRetryMission()/
  // commandFor("mission") di ssh-manager.ts.
  // start_batch:=/retry_takeoff:= (versi sebelumnya) DIHAPUS SEPENUHNYA.
  const [missionMode, setMissionMode] = useState<"full" | "retry">("full");
  const [retryBatch, setRetryBatch] = useState("2");
  // Loading state khusus langkah "bangun mission_retry.yaml" (async,
  // terjadi SEBELUM startService dipanggil) -- beda dari `building` (Build
  // colcon) yang sudah ada.
  const [retryBuilding, setRetryBuilding] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  // BUG NYATA ditemukan+fix 2026-09-16 (dilaporkan user: "pengambilan data
  // WP1 retry gagal dari LCD"): handleMissionStart() DULU selalu memanggil
  // buildRetryMission() lagi tepat sebelum start -- build_retry_mission.py
  // (versi lama) menyalin WP1 APA ADANYA dari mission.yaml ASLI, jadi kalau
  // WP1 sudah di-capture (posisi GPS live, baik lewat tombol "Ambil WP1
  // Retry" di web MAUPUN lewat menu WP1 RETRY di LCD fisik), rebuild itu
  // menghapus hasil capture-nya tanpa peringatan apa pun. Sempat "diperbaiki"
  // di sini dengan retryReadyBatch (skip rebuild kalau batch tidak berubah)
  // -- TAPI itu sendiri jadi bug BARU (ditemukan 2026-09-17, dilaporkan
  // user: "kok masih batch 3 aja gak mau lanjut" setelah build_retry_
  // mission.py diperbaiki jadi multi-batch): cache retryReadyBatch di
  // browser bikin Start SKIP rebuild dan pakai mission_retry.yaml BASI dari
  // sebelum perbaikan multi-batch itu ada. retryReadyBatch DIHAPUS TOTAL --
  // build_retry_mission.py SEKARANG SENDIRI yang menjaga WP1 hasil capture
  // (deteksi otomatis di server, lihat catatan di file itu), jadi rebuild
  // di SETIAP Start sudah aman & TIDAK BUTUH cache client-side lagi sama
  // sekali -- ini juga jadi satu-satunya cara mission_retry.yaml SELALU
  // ikut mission.yaml/batch TERBARU, bukan basi dari sesi browser lama.

  // Jumlah batch untuk Retry Mission (2026-09-16, atas permintaan user) --
  // "jumlah batch tolong disinkronkan dengan jumlah batch yang telah
  // disimpan dan auto sync". Dulu BATCH cuma input angka bebas (operator
  // bisa ketik nomor yang sebenarnya tidak ada di mission.yaml) -- sekarang
  // dropdown, opsinya SELALU diturunkan dari wp.batch real (label "#
  // BATCH N" di mission.yaml, lihat mission-yaml.ts) tiap kali `waypoints`
  // di-refresh (Ambil WP/Tambah WP/Delete WP/Save semua ikut update ini
  // otomatis lewat refreshWaypoints() yang sudah ada). Batch 1 SENGAJA
  // TIDAK jadi opsi -- retry dari batch 1 = sama saja dengan Full Mission
  // (WP1 sudah otomatis ikut di file retry manapun).
  const maxBatch =
    waypoints.length > 0
      ? Math.max(1, ...waypoints.map((wp) => Number(wp.batch) || 1))
      : 1;
  const canRetry = maxBatch >= 2;
  useEffect(() => {
    const clamped = Math.min(Math.max(Number(retryBatch) || 2, 2), Math.max(maxBatch, 2));
    if (clamped !== Number(retryBatch)) {
      const timer = setTimeout(() => setRetryBatch(String(clamped)), 0);
      return () => clearTimeout(timer);
    }
  }, [maxBatch, retryBatch]);

  // Baca mission.yaml REAL dari raspi lewat /api/mission/waypoints.
  const refreshWaypoints = useCallback(async () => {
    try {
      const res = await fetch("/api/mission/waypoints");
      const data = await res.json();
      if (data.ok) {
        setWaypoints(data.waypoints);
        setSyncError(null);
      } else {
        setSyncError(data.error || "Gagal membaca mission.yaml.");
      }
    } catch {
      setSyncError("Gagal menghubungi server untuk membaca mission.yaml.");
    }
  }, []);

  // BUG NYATA ditemukan 2026-09-16 (dilaporkan user: "batchnya kok masih
  // sama" padahal WP baru diedit lewat LCD FISIK, bukan lewat web) --
  // dulu cuma refetch SEKALI begitu SSH connect, TIDAK ada polling
  // berkala sama sekali. Perubahan dari sumber LAIN (LCD fisik, SSH
  // manual, dst -- bukan cuma tombol web) jadi tidak pernah kelihatan di
  // sini sampai reconnect. MAP tab (map-view.tsx) SUDAH poll tiap 3s untuk
  // kasus yang sama -- pola sama disamakan di sini.
  useEffect(() => {
    if (!connected) return;
    const initialTimer = setTimeout(refreshWaypoints, 0);
    const timer = setInterval(refreshWaypoints, WAYPOINTS_POLL_MS);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(timer);
    };
  }, [connected, refreshWaypoints]);

  // Begitu ada capture GPS (Ambil WP, atau Save metadata di modal Detail)
  // yang baru saja sukses, WP list di sini sudah basi (koordinat/field
  // baru belum kelihatan) -- refetch otomatis. ("Tambah WP" refresh
  // sendiri langsung di handleAddWaypoint, tidak lewat waypointCapture
  // sama sekali karena tidak mengambil GPS.) Ref dipakai supaya cuma
  // refetch SEKALI per capture yang baru sukses (bukan tiap render/polling
  // ulang).
  const [seenSuccessTs, setSeenSuccessTs] = useState<Record<number, number>>({});
  useEffect(() => {
    let changed = false;
    const next = { ...seenSuccessTs };
    for (const [idxStr, entry] of Object.entries(waypointCapture)) {
      const idx = Number(idxStr);
      if (entry.status === "success" && next[idx] !== entry.ts) {
        next[idx] = entry.ts;
        changed = true;
      }
    }
    if (!changed) return;
    const timer = setTimeout(() => {
      setSeenSuccessTs(next);
      refreshWaypoints();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waypointCapture]);

  useEffect(() => {
    if (!missionExecuting) {
      // setTimeout(fn, 0) alih-alih manggil setActiveWpIndex() langsung --
      // pola sama seperti useGroundControl.tsx, menghindari "setState
      // sinkron di dalam effect" yang bikin render cascade.
      const resetTimer = setTimeout(() => setActiveWpIndex(0), 0);
      return () => clearTimeout(resetTimer);
    }
    const timer = setInterval(() => {
      setActiveWpIndex((i) => Math.min(i + 1, waypoints.length));
    }, SIMULATED_ADVANCE_MS);
    return () => clearInterval(timer);
  }, [missionExecuting, waypoints.length]);

  const handleCapture = (wp: Waypoint) => {
    captureWaypoint(Number(wp.index), {
      holdS: wp.hold,
      speedMps: wp.speed === "--" ? "nan" : wp.speed,
      altM: wp.alt,
      gripperOpen: wp.gripper === "OPEN",
    });
  };

  // Atas permintaan user: "Tambah WP" TIDAK perlu ambil GPS dulu -- cukup
  // sisipkan placeholder WP baru (lat/lon di-copy dari WP terakhir oleh
  // add_waypoint.py di raspi), operator bisa isi GPS beneran belakangan
  // lewat "Ambil WP" atau edit field lain lewat modal Detail (Save).
  const handleAddWaypoint = async () => {
    const result = await addWaypoint();
    if (!result.ok) {
      throw new Error(result.error || "Gagal menambah WP baru.");
    }
    await refreshWaypoints();
  };

  const handleDeleted = () => {
    setModalWp(null);
    refreshWaypoints();
  };

  // Retry Mission (2026-09-16, REVISI): bangun mission_retry.yaml dulu
  // (dari BATCH terpilih, SELALU dari data mission.yaml TERBARU) baru
  // start mission dengan config:=mission_retry.yaml. Full Mission tidak
  // butuh langkah build sama sekali, langsung startService biasa.
  const handleMissionStart = async () => {
    if (missionMode === "full") {
      startService("mission");
      return;
    }
    setRetryError(null);
    // SELALU rebuild dari mission.yaml TERBARU tiap Start ditekan --
    // build_retry_mission.py sendiri yang menjaga WP1 hasil capture (lihat
    // catatan di atas), jadi TIDAK ada lagi cache "skip rebuild" di sini.
    setRetryBuilding(true);
    try {
      const result = await buildRetryMission(Number(retryBatch));
      if (!result.ok) {
        setRetryError(result.error || "Gagal membangun mission_retry.yaml.");
        return;
      }
      await startService("mission", { useRetryFile: true });
    } finally {
      setRetryBuilding(false);
    }
  };

  // "Ambil WP1 Retry" (2026-09-16): pastikan mission_retry.yaml ada/fresh
  // dulu (build dari batch terpilih -- kalau belum pernah di-build,
  // wp.launch.xml butuh file yang SUDAH VALID buat nulis ulang WP1-nya),
  // BARU capture GPS live ke WP1 file itu. Params (hold/speed/alt/gripper)
  // diambil dari waypoints[0] -- WP1 ASLI di mission.yaml, "sama kaya WP1
  // batch 1 yang biasanya" sesuai permintaan user.
  const handleCaptureRetryWp1 = async () => {
    const wp1 = waypoints[0];
    if (!wp1) return;
    setRetryError(null);
    const buildResult = await buildRetryMission(Number(retryBatch));
    if (!buildResult.ok) {
      setRetryError(buildResult.error || "Gagal membangun mission_retry.yaml.");
      return;
    }
    // BUG ditemukan+fix 2026-09-16: dulu hasil captureRetryWp1() (bisa
    // {ok:false, error:...}) TIDAK PERNAH dicek -- kalau capture-nya
    // gagal (mis. SSH/launch timeout), operator tidak pernah tahu, cuma
    // lihat tombol kembali ke "Ambil WP1 Retry" tanpa penjelasan apa pun.
    const captureResult = await captureRetryWp1({
      holdS: wp1.hold,
      speedMps: wp1.speed === "--" ? "nan" : wp1.speed,
      altM: wp1.alt,
      gripperOpen: wp1.gripper === "OPEN",
    });
    if (!captureResult.ok) {
      setRetryError(captureResult.error || "Gagal mengambil GPS untuk WP1 Retry.");
      return;
    }
  };

  const handleResetClick = async () => {
    if (!resetConfirming) {
      setResetConfirming(true);
      return;
    }
    setResetting(true);
    try {
      const result = await resetAllWaypoints();
      if (!result.ok) {
        throw new Error(result.error || "Gagal reset waypoint.");
      }
      await refreshWaypoints();
    } finally {
      setResetting(false);
      setResetConfirming(false);
    }
  };

  return (
    <Card className="overflow-hidden border-slate-200 bg-white py-0 shadow-sm">
      <CardHeader className="flex min-h-12 flex-row items-center justify-between border-b border-slate-100 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md border border-yellow-100 bg-yellow-50 text-yellow-600">
            <MapPin size={13} />
          </div>
          <div>
            <CardTitle className="text-[12px] font-black tracking-wide text-slate-700">
              WAYPOINT COORDINATE
            </CardTitle>
            <p className="font-mono text-[9px] text-slate-400">
              {waypoints.length} WP{waypoints.length !== 1 ? "s" : ""} tersimpan di mission.yaml
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <Button
              disabled={!connected || building || running}
              onClick={() => buildMission()}
              size="sm"
              variant="outline"
              className="h-9 text-[10px] font-bold"
              title={
                running
                  ? "Stop mission dulu sebelum build ulang"
                  : "colcon build --packages-select waypoint_mission"
              }
            >
              <Hammer size={12} className="mr-1" />
              {building ? "Building..." : "Build"}
            </Button>
            <Button
              disabled={!connected || running || resetting}
              onClick={handleResetClick}
              size="sm"
              variant="outline"
              className={`h-9 text-[10px] font-bold ${
                resetConfirming
                  ? "border-red-300 bg-red-600 text-white hover:bg-red-700"
                  : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
              }`}
              title="Hapus SELURUH waypoint di mission.yaml -- fungsi sama seperti RESET di LCD fisik"
            >
              <RotateCcw size={12} className="mr-1" />
              {resetting ? "Menghapus..." : resetConfirming ? "Yakin? Klik lagi" : "Reset"}
            </Button>
            <AddWpButton
              disabled={!connected || running || anyCapturing}
              onAdd={handleAddWaypoint}
            />
            <Button
              disabled={
                !connected ||
                status === "starting" ||
                status === "stopping" ||
                retryBuilding ||
                (missionMode === "retry" && !running && !canRetry)
              }
              onClick={() => (status === "running" ? stopService("mission") : handleMissionStart())}
              size="sm"
              className="h-9 text-[10px] font-bold"
            >
              {retryBuilding
                ? "Membangun retry..."
                : running
                  ? "Mission Stop"
                  : display.action === "Start"
                    ? "Mission Start"
                    : display.action}
            </Button>
            <div className="flex rounded-full border border-slate-200 bg-slate-100 p-0.5">
              <button
                type="button"
                onClick={() => setMissionMode("retry")}
                className={`rounded-full px-2.5 py-1 text-[9px] font-bold transition ${
                  missionMode === "retry"
                    ? "bg-amber-500 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Retry Mission
              </button>
              <button
                type="button"
                onClick={() => setMissionMode("full")}
                className={`rounded-full px-2.5 py-1 text-[9px] font-bold transition ${
                  missionMode === "full"
                    ? "bg-cyan-600 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Full Mission
              </button>
            </div>
          </div>
          {missionMode === "retry" && (
            <div className="flex flex-col gap-1.5 rounded-lg border border-amber-100 bg-amber-50 px-2.5 py-1.5">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-[9px] font-bold text-slate-500">
                  BATCH TARGET
                  {canRetry ? (
                    <select
                      value={retryBatch}
                      onChange={(e) => setRetryBatch(e.target.value)}
                      className="h-7 w-16 rounded-md border border-slate-200 bg-white px-1.5 text-center font-mono text-[10px] text-slate-700 focus:border-cyan-300 focus:outline-none"
                      title="Mission akan takeoff (WP1) lalu langsung ke batch ini -- dibangun ulang dari mission.yaml terbaru tiap kali Start ditekan"
                    >
                      {Array.from({ length: maxBatch - 1 }, (_, i) => i + 2).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="font-mono text-[9px] text-slate-400">
                      (belum ada batch ke-2)
                    </span>
                  )}
                </label>
                <Wp1RetryButton
                  disabled={!connected || running || anyCapturing || waypoints.length === 0}
                  onCapture={handleCaptureRetryWp1}
                />
              </div>
              <p className="font-mono text-[8px] text-slate-500">
                Mission = WP1 (takeoff) + BATCH {retryBatch} sampai batch terakhir (batch
                sebelumnya di-skip). &quot;Ambil WP1 Retry&quot; opsional -- kalau drone mendarat di
                lokasi BEDA dari WP1 asli, ambil ulang titik takeoff di sini (params sama
                seperti WP1 asli, TIDAK mengubah mission.yaml). File dibangun ulang OTOMATIS
                dari mission.yaml TERBARU setiap Start ditekan -- WP1 hasil capture (dari
                web maupun LCD fisik) TETAP dipertahankan otomatis, tidak akan ketimpa.
              </p>
              {retryError && (
                <p className="font-mono text-[9px] font-bold text-red-600">{retryError}</p>
              )}
            </div>
          )}
          {running && (
            <Button
              onClick={() => sendMissionAccept()}
              size="sm"
              variant="outline"
              className="h-8 text-[9px] font-bold"
            >
              Accept
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-3">
        {syncError && (
          <div className="mb-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 font-mono text-[9px] font-bold text-red-600">
            {syncError}
          </div>
        )}
        {running && !missionExecuting && (
          <div className="mb-3 flex items-center gap-1.5 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 font-mono text-[9px] font-bold text-amber-700">
            <Loader2 size={11} className="animate-spin" />
            Menunggu takeoff (OFFBOARD hold / konfirmasi Accept / arm / climb) -- status
            WP di bawah belum mulai bergerak sampai drone benar-benar armed + AUTO.MISSION.
          </div>
        )}
        <div className="max-h-[260px] overflow-x-auto overflow-y-auto rounded-lg border border-slate-100">
          <table className="w-full min-w-[580px] text-left">
            <thead className="sticky top-0 bg-slate-50">
              <tr className="border-b border-slate-100">
                {["WP#", "TYPE", "BATCH", "STATUS", "AMBIL WP", ""].map((head) => (
                  <th
                    key={head}
                    className="whitespace-nowrap px-2 py-2 text-[9px] font-black tracking-wide text-slate-400"
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {waypoints.map((wp, i) => {
                const wpNumber = i + 1;
                const passed = missionExecuting && wpNumber < activeWpIndex + 1 && wpNumber <= activeWpIndex;
                const isActive = missionExecuting && wpNumber === activeWpIndex + 1;
                return (
                  <tr
                    key={wp.index}
                    className={`border-b border-slate-50 last:border-0 ${passed ? "bg-green-50" : "hover:bg-slate-50/70"}`}
                  >
                    <td className="px-2 py-2 text-[10px] font-bold text-cyan-700">
                      <Badge
                        variant="outline"
                        className="border-cyan-200 bg-cyan-50 px-2 text-[9px] text-cyan-700"
                      >
                        {wp.index}
                      </Badge>
                    </td>
                    <td className="px-2 py-2 text-[10px] font-bold text-cyan-700">{wp.type}</td>
                    <td className="px-2 py-2 text-[10px] font-bold text-slate-500">
                      <Badge
                        variant="outline"
                        className="border-amber-200 bg-amber-50 px-2 text-[9px] text-amber-700"
                      >
                        {wp.batch}
                      </Badge>
                    </td>
                    <td className="px-2 py-2 text-[9px] font-bold">
                      {passed ? (
                        <span className="text-green-600">✓ PASSED</span>
                      ) : isActive ? (
                        <span className="flex items-center gap-1.5 text-yellow-600">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-yellow-500" />
                          </span>
                          ACTIVE
                        </span>
                      ) : (
                        <span className="text-slate-400">PENDING</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <CaptureWpButton
                        wp={wp}
                        disabled={!connected || running || anyCapturing}
                        onCapture={() => handleCapture(wp)}
                      />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <Button
                        onClick={() => setModalWp(wp)}
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[8px] font-bold"
                      >
                        Detail
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
      <WaypointDetailModal
        wp={modalWp}
        open={modalWp !== null}
        onClose={() => setModalWp(null)}
        onDeleted={handleDeleted}
      />
    </Card>
  );
}
