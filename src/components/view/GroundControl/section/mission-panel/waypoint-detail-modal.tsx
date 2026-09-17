"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useGroundControl } from "../../useGroundControl";
import type { Waypoint } from "@/lib/mission-yaml";

export type { Waypoint } from "@/lib/mission-yaml";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[9px] font-bold text-slate-400">{label}</span>
      {children}
    </label>
  );
}

const editableClass =
  "h-8 w-full rounded-md border border-slate-200 bg-white px-2 font-mono text-[11px] text-slate-700 focus:border-cyan-300 focus:outline-none";
const readOnlyClass =
  "h-8 w-full rounded-md border border-slate-200 bg-slate-50 px-2 font-mono text-[11px] text-slate-400";
const selectClass =
  "h-8 w-full rounded-md border border-slate-200 bg-white px-2 font-mono text-[11px] text-slate-700 focus:border-cyan-300 focus:outline-none";

// HOLD/ALT/BATCH/SPEED/GRIPPER/LAND bisa diedit & disimpan lewat tombol
// Save di bawah -- ini menulis ulang WP yang SUDAH ADA lewat
// wp.launch.xml dengan metadata_only:=true (TIDAK mengambil GPS baru sama
// sekali, lat/lon LAMA dipertahankan apa adanya oleh
// position_reporter_node.cpp), meniru PERSIS menu "SETTING WP" di
// wp_trigger_controller (LCD fisik) -- lihat real_wp_capture.cpp
// buildCommand(metadata_only) di ui_ws. LON/LAT TETAP read-only (satu-
// satunya cara mengubahnya adalah tombol "Ambil WP" di tabel utama, yang
// betulan mengambil posisi GPS live).
export function WaypointDetailModal({
  wp,
  open,
  onClose,
  onDeleted,
}: {
  wp: Waypoint | null;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { connStatus, deleteWaypointCoord, captureWaypoint, waypointCapture } = useGroundControl();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const connected = connStatus === "connected";

  const [holdS, setHoldS] = useState("0.000");
  const [altM, setAltM] = useState("1.0");
  const [batch, setBatch] = useState("1");
  const [speedMps, setSpeedMps] = useState("1.0");
  const [gripperOpen, setGripperOpen] = useState(false);
  const [land, setLand] = useState(false);
  const [confirmingLand, setConfirmingLand] = useState(false);

  // Reset form field tiap kali modal dibuka untuk WP yang berbeda (atau
  // ditutup) -- pola setTimeout(fn, 0) untuk hindari "setState sinkron di
  // dalam effect" (react-hooks/set-state-in-effect), konsisten dengan pola
  // established di mission-panel.tsx.
  useEffect(() => {
    if (!wp) return;
    const timer = setTimeout(() => {
      setHoldS(wp.hold);
      setAltM(wp.alt);
      setBatch(wp.batch);
      setSpeedMps(wp.speed === "--" ? "" : wp.speed);
      setGripperOpen(wp.gripper === "OPEN");
      // LAND SENGAJA tidak di-prefill dari wp.land (yang cuma "posisi WP
      // terakhir?" hasil kalkulasi tampilan, BUKAN field tersimpan) --
      // selalu mulai dari false supaya operator harus SENGAJA menyalakannya
      // (efeknya memotong/menonaktifkan semua WP setelah ini, lihat warning
      // di bawah).
      setLand(false);
      setConfirmingLand(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [wp]);

  if (!wp) return null;

  const entry = waypointCapture[Number(wp.index)];
  const saving = entry?.status === "capturing";

  const handleDeleteClick = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setDeleting(true);
    try {
      await deleteWaypointCoord(Number(wp.index));
      onDeleted();
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  };

  const handleSaveClick = async () => {
    if (land && !confirmingLand) {
      setConfirmingLand(true);
      return;
    }
    await captureWaypoint(Number(wp.index), {
      holdS,
      speedMps: speedMps.trim().length === 0 ? "nan" : speedMps,
      altM,
      gripperOpen,
      batch,
      land,
      metadataOnly: true,
    });
    setConfirmingLand(false);
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        setConfirming(false);
        onClose();
      }}
      title={`WP${wp.index} DETAIL`}
    >
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Field label="HOLD (s)">
            <input
              value={holdS}
              onChange={(e) => setHoldS(e.target.value)}
              disabled={!connected || saving}
              className={editableClass}
            />
          </Field>
          <Field label="ALT (m)">
            <input
              value={altM}
              onChange={(e) => setAltM(e.target.value)}
              disabled={!connected || saving}
              className={editableClass}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="BATCH">
            <input
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
              disabled={!connected || saving}
              className={editableClass}
            />
          </Field>
          <Field label="SPEED (m/s)">
            <input
              value={speedMps}
              onChange={(e) => setSpeedMps(e.target.value)}
              placeholder="nan"
              disabled={!connected || saving}
              className={editableClass}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="GRIPPER">
            <select
              value={gripperOpen ? "OPEN" : "CLOSE"}
              onChange={(e) => setGripperOpen(e.target.value === "OPEN")}
              disabled={!connected || saving}
              className={selectClass}
            >
              <option value="CLOSE">CLOSE</option>
              <option value="OPEN">OPEN</option>
            </select>
          </Field>
          <Field label="LAND">
            <select
              value={land ? "TRUE" : "FALSE"}
              onChange={(e) => {
                setLand(e.target.value === "TRUE");
                setConfirmingLand(false);
              }}
              disabled={!connected || saving}
              className={selectClass}
            >
              <option value="FALSE">FALSE</option>
              <option value="TRUE">TRUE</option>
            </select>
          </Field>
        </div>
        {land && (
          <div className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[9px] font-bold text-amber-700">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            WP setelah WP{wp.index} akan otomatis dinonaktifkan (di-comment) di mission.yaml.
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Field label="LON (read-only)">
            <input value={wp.lon} readOnly className={readOnlyClass} />
          </Field>
          <Field label="LAT (read-only)">
            <input value={wp.lat} readOnly className={readOnlyClass} />
          </Field>
        </div>
        {entry && (
          <p
            className={`font-mono text-[9px] font-bold ${
              entry.status === "error" ? "text-red-600" : "text-slate-400"
            }`}
          >
            {entry.message}
          </p>
        )}
        <div className="flex gap-2 border-t border-slate-100 pt-3">
          <Button
            size="sm"
            variant="outline"
            disabled={!connected || saving}
            onClick={handleSaveClick}
            className={`h-8 flex-1 text-[10px] font-bold ${
              confirmingLand
                ? "border-amber-300 bg-amber-500 text-white hover:bg-amber-600"
                : "border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100"
            }`}
          >
            <Save size={12} className="mr-1" />
            {saving
              ? "Menyimpan..."
              : confirmingLand
                ? "Yakin? Klik lagi untuk simpan + potong misi"
                : "Save"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!connected || deleting}
            onClick={handleDeleteClick}
            className={`h-8 flex-1 text-[10px] font-bold ${
              confirming
                ? "border-red-300 bg-red-600 text-white hover:bg-red-700"
                : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
            }`}
          >
            <Trash2 size={12} className="mr-1" />
            {deleting ? "Menghapus..." : confirming ? "Yakin? Klik lagi untuk hapus WP ini" : "Delete WP"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
