"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  BatteryMedium,
  CircleDot,
  Loader2,
  Plane,
  Radio,
  Save,
  Satellite,
  Settings,
  SignalHigh,
  SignalLow,
  SignalMedium,
  SignalZero,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useGroundControl } from "../../useGroundControl";

function HeaderStatus({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="flex h-11 min-w-[122px] flex-1 items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 sm:min-w-[145px] sm:flex-none">
      <div className="text-cyan-600">{icon}</div>
      <div className="min-w-0">
        <div className="text-[9px] font-bold text-slate-400">{label}</div>
        <div className="truncate text-[10px] font-bold text-slate-600">
          {value}
        </div>
        <div className="truncate font-mono text-[9px] text-slate-400">
          {sub}
        </div>
      </div>
    </div>
  );
}

function ConnectPanel({ onClose }: { onClose: () => void }) {
  const {
    host,
    backupHost,
    port,
    username,
    password,
    setHost,
    setBackupHost,
    setPort,
    setUsername,
    setPassword,
    connStatus,
    connError,
    activeHost,
    connect,
    disconnect,
  } = useGroundControl();

  // Host/IP TIDAK LAGI berubah tiap ketikan -- diketik ke draft LOKAL
  // dulu, host asli (dipakai buat Connect + tersimpan ke localStorage)
  // cuma berubah begitu tombol "Simpan IP" ditekan. Ini yang diminta user
  // 2026-09-15 ("jangan pernah mengubah ip nya" tanpa aksi eksplisit) --
  // dulu tiap huruf yang diketik langsung jadi IP aktif.
  const [hostDraft, setHostDraft] = useState(host);
  const [justSaved, setJustSaved] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setHostDraft(host), 0);
    return () => clearTimeout(timer);
  }, [host]);

  const hostDirty = hostDraft.trim() !== host;
  const handleSaveIp = () => {
    const next = hostDraft.trim();
    if (!next || next === host) return;
    setHost(next);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1500);
  };

  // Backup IP (2026-09-16) -- pola draft+save SAMA seperti host utama di
  // atas, TAPI boleh disimpan kosong (mengosongkan = mematikan failover).
  // connect() otomatis coba backupHost kalau host utama gagal (lihat
  // useGroundControl.tsx) -- untuk kasus persis yang diminta user: salah
  // satu adaptor WiFi raspi tidak kedetect/gagal konek.
  const [backupDraft, setBackupDraft] = useState(backupHost);
  const [backupJustSaved, setBackupJustSaved] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setBackupDraft(backupHost), 0);
    return () => clearTimeout(timer);
  }, [backupHost]);

  const backupDirty = backupDraft.trim() !== backupHost;
  const handleSaveBackupIp = () => {
    const next = backupDraft.trim();
    if (next === backupHost) return;
    setBackupHost(next);
    setBackupJustSaved(true);
    setTimeout(() => setBackupJustSaved(false), 1500);
  };

  return (
    <div className="absolute right-4 top-[70px] z-50 w-[300px] rounded-lg border border-slate-200 bg-white p-4 shadow-lg lg:right-6">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-black tracking-wide text-slate-700">
          SSH CONNECTION
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-[10px] font-bold text-slate-400 hover:text-slate-600"
        >
          Close
        </button>
      </div>
      <div className="space-y-2">
        <label className="block">
          <span className="mb-1 block text-[9px] font-bold text-slate-400">
            Host / IP
          </span>
          <div className="flex gap-1.5">
            <input
              value={hostDraft}
              onChange={(e) => setHostDraft(e.target.value)}
              placeholder="10.42.0.29"
              className="h-8 w-full rounded-md border border-slate-200 px-2 font-mono text-[11px] text-slate-700 outline-none focus:border-cyan-400"
            />
            <Button
              type="button"
              onClick={handleSaveIp}
              disabled={!hostDirty || hostDraft.trim().length === 0}
              size="sm"
              variant="outline"
              className="h-8 shrink-0 gap-1 px-2 text-[9px] font-bold"
              title="Simpan IP ini -- host TIDAK akan berubah sampai tombol ini ditekan lagi"
            >
              <Save size={11} />
              {justSaved ? "Tersimpan" : "Simpan IP"}
            </Button>
          </div>
        </label>
        <label className="block">
          <span className="mb-1 block text-[9px] font-bold text-slate-400">
            Backup IP (opsional -- adaptor WiFi cadangan)
          </span>
          <div className="flex gap-1.5">
            <input
              value={backupDraft}
              onChange={(e) => setBackupDraft(e.target.value)}
              placeholder="10.42.0.229"
              className="h-8 w-full rounded-md border border-slate-200 px-2 font-mono text-[11px] text-slate-700 outline-none focus:border-cyan-400"
            />
            <Button
              type="button"
              onClick={handleSaveBackupIp}
              disabled={!backupDirty}
              size="sm"
              variant="outline"
              className="h-8 shrink-0 gap-1 px-2 text-[9px] font-bold"
              title="Kalau host utama gagal konek, Connect otomatis coba IP ini -- kosongkan untuk matikan failover"
            >
              <Save size={11} />
              {backupJustSaved ? "Tersimpan" : "Simpan IP"}
            </Button>
          </div>
          {activeHost && activeHost !== host && (
            <p className="mt-1 font-mono text-[9px] font-bold text-amber-600">
              Sedang pakai backup IP ({activeHost}) -- host utama gagal konek.
            </p>
          )}
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[9px] font-bold text-slate-400">
              Port
            </span>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value) || 22)}
              className="h-8 w-full rounded-md border border-slate-200 px-2 font-mono text-[11px] text-slate-700 outline-none focus:border-cyan-400"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[9px] font-bold text-slate-400">
              Username
            </span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="h-8 w-full rounded-md border border-slate-200 px-2 font-mono text-[11px] text-slate-700 outline-none focus:border-cyan-400"
            />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-[9px] font-bold text-slate-400">
            Password (kosongkan = pakai SSH key ~/.ssh/id_ed25519)
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-8 w-full rounded-md border border-slate-200 px-2 font-mono text-[11px] text-slate-700 outline-none focus:border-cyan-400"
          />
        </label>
      </div>

      {connError && (
        <p className="mt-2 text-[9px] font-bold text-red-500">{connError}</p>
      )}
      <div className="mt-3 flex gap-2">
        {connStatus === "connected" ? (
          <Button
            onClick={disconnect}
            size="sm"
            variant="outline"
            className="h-8 flex-1 gap-1.5 text-[10px] font-bold"
          >
            <WifiOff size={12} />
            Disconnect
          </Button>
        ) : (
          <Button
            onClick={connect}
            disabled={connStatus === "connecting" || !host || !username}
            size="sm"
            className="h-8 flex-1 gap-1.5 bg-slate-800 text-[10px] font-bold hover:bg-slate-700"
          >
            {connStatus === "connecting" ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Wifi size={12} />
            )}
            {connStatus === "connecting" ? "Connecting…" : "Connect"}
          </Button>
        )}
      </div>
    </div>
  );
}

const FIX_TYPE_LABEL: Record<number, string> = {
  0: "NO FIX", 1: "NO FIX", 2: "2D FIX", 3: "3D FIX", 4: "DGPS",
  5: "RTK FLOAT", 6: "RTK FIXED", 7: "STATIC", 8: "PPP",
};

// Label singkat per adaptor (2026-09-16) -- nama interface raw
// ("wlxd4d6df574517") terlalu panjang buat widget kecil di header.
const WIFI_IFACE_LABEL: Record<string, string> = {
  wlan0: "WLAN0",
  wlxd4d6df574517: "TP-LINK",
};

// Ambang dBm kasar (WiFi umum: -50 sangat bagus, -70 mulai lemah,
// -80 ke bawah nyaris putus) -- murni buat pilih ikon, bukan nilai presisi.
function wifiSignalIcon(dbm: number | null) {
  if (dbm === null) return SignalZero;
  if (dbm >= -60) return SignalHigh;
  if (dbm >= -70) return SignalMedium;
  return SignalLow;
}

export function Header() {
  const { connStatus, host, port, telemetry, rtk, services, wifiSignal } = useGroundControl();
  const [panelOpen, setPanelOpen] = useState(false);

  const statusLabel =
    connStatus === "connected"
      ? "Connected"
      : connStatus === "connecting"
        ? "Connecting…"
        : connStatus === "error"
          ? "Connection Error"
          : "Disconnected";

  const gps = telemetry.gpsRaw;
  const dopValue = gps
    ? `HDOP ${gps.hdop?.toFixed(2) ?? "--"} / VDOP ${gps.vdop?.toFixed(2) ?? "--"}`
    : "HDOP -- / VDOP --";
  const dopSub = gps
    ? `${gps.satellitesVisible} SATS · ${FIX_TYPE_LABEL[gps.fixType] ?? "UNKNOWN"}`
    : "-- SATS · NO FIX";

  const mavState = telemetry.state;
  const mavlinkValue = mavState ? (mavState.connected ? "FCU LINK OK" : "NO FCU LINK") : "NOT RUNNING";
  const mavlinkSub = mavState ? `MODE ${mavState.mode || "--"}` : "MAVROS not running";

  const rtkRunning = rtk.status === "running";
  const relayRunning = services.rtkRelay.status === "running";

  // percentage dari FC ini SELALU 0.0 (tidak diisi firmware) -- widget ini
  // SENGAJA cuma menampilkan voltage/current (data yang beneran terisi),
  // bukan percentage yang menyesatkan.
  const battery = telemetry.battery;
  const batteryValue = battery ? `${battery.voltage.toFixed(1)} V` : "--";
  const batterySub = battery ? `${battery.current.toFixed(1)} A` : "no battery data";

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white">
      {/* SATU baris flex-wrap (bukan "hidden ... xl:flex" seperti dulu) --
          di layar lebar semuanya tetap muat di satu baris persis seperti
          sebelumnya, tapi begitu tidak cukup lebar (browser diperkecil ke
          setengah layar), strip status ini pindah ke baris baru dengan
          sendirinya alih-alih hilang total (diminta user 2026-09-15). */}
      <div className="flex min-h-[84px] flex-wrap items-center gap-3 px-4 py-2.5 lg:px-6 xl:pr-8 2xl:pr-10">
        <div className="flex min-w-[285px] items-center gap-3">
          <Image
            src="/logo.jpeg"
            alt="Soerasky logo"
            width={36}
            height={36}
            className="shrink-0 rounded-lg"
          />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[19px] font-black tracking-[0.08em] text-slate-800">
                SOERASKY
              </h1>
              <Badge
                variant="outline"
                className="h-6 border-cyan-200 bg-cyan-50 px-2 text-[9px] font-bold text-cyan-700"
              >
                GROUND CONTROL
              </Badge>
              <Badge
                variant="outline"
                className="hidden h-6 border-slate-200 bg-slate-50 px-2 text-[9px] font-bold text-slate-400 md:flex"
              >
                VTOL DESKTOP
              </Badge>
            </div>
            <div className="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-slate-400">
              <CircleDot size={11} className={connStatus === "connected" ? "text-green-500" : ""} />
              <span>1 SSH Session</span>
              <span>•</span>
              <span>Multiplexed</span>
              <span>•</span>
              <span>Local RTK</span>
            </div>
          </div>
        </div>
        <div className="relative flex flex-1 items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0 border-slate-200"
            onClick={() => setPanelOpen((v) => !v)}
          >
            <Settings size={16} />
          </Button>
          <Button
            size="sm"
            onClick={() => setPanelOpen(true)}
            className={`h-10 gap-2 px-4 text-[11px] font-bold ${
              connStatus === "connected"
                ? "bg-green-600 hover:bg-green-700"
                : "bg-slate-800 hover:bg-slate-700"
            }`}
          >
            {connStatus === "connected" ? <Wifi size={13} /> : <WifiOff size={13} />}
            {connStatus === "connected" ? `${host}:${port}` : "Connect SSH"}
          </Button>
          {panelOpen && <ConnectPanel onClose={() => setPanelOpen(false)} />}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HeaderStatus
            icon={<Wifi size={11} />}
            label="SSH"
            value={statusLabel}
            sub={host ? `${host}:${port}` : "IP belum disimpan"}
          />
          <HeaderStatus
            icon={<Satellite size={11} />}
            label="DOP"
            value={dopValue}
            sub={dopSub}
          />
          <HeaderStatus
            icon={<Radio size={11} />}
            label="MAVLINK"
            value={mavlinkValue}
            sub={mavlinkSub}
          />
          <HeaderStatus
            icon={<Plane size={11} />}
            label="RC"
            value="ELRS 2.4G"
            sub="FS: SAFE · NO LINK"
          />
          <HeaderStatus
            icon={<BatteryMedium size={11} />}
            label="BATTERY"
            value={batteryValue}
            sub={batterySub}
          />
          <div className="flex h-11 items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-4">
            <div className={`h-2 w-2 rounded-full ${rtkRunning ? "bg-green-500" : "bg-slate-300"}`} />
            <div>
              <div className="text-[9px] font-bold text-slate-500">RTK</div>
              <div className="font-mono text-[9px] text-slate-400">
                {`LOCAL · ${rtkRunning ? "ON" : "OFF"}${connStatus === "connected" ? ` / RASPI · ${relayRunning ? "ON" : "OFF"}` : ""}`}
              </div>
            </div>
          </div>
          {/* Sinyal WiFi 2 adaptor raspi (2026-09-16, atas permintaan user)
              -- wlan0 (bawaan) + TP-Link USB (cadangan), lihat
              ssh-manager.ts getWifiSignal(). Cuma tampil kalau connected
              (data dari polling SSH exec, kosong kalau belum connect). */}
          {connStatus === "connected" && wifiSignal.length > 0 && (
            <div className="flex h-11 items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4">
              {wifiSignal.map((w) => {
                const Icon = wifiSignalIcon(w.signalDbm);
                return (
                  <div key={w.iface} className="flex items-center gap-1.5">
                    <Icon
                      size={13}
                      className={w.connected ? "text-cyan-600" : "text-slate-300"}
                    />
                    <div>
                      <div className="text-[9px] font-bold text-slate-500">
                        {WIFI_IFACE_LABEL[w.iface] ?? w.iface}
                      </div>
                      <div className="font-mono text-[9px] text-slate-400">
                        {w.connected ? `${w.signalDbm} dBm` : "no link"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
