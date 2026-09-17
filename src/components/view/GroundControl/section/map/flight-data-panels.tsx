"use client";

import { Circle, Disc } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TelemetryData } from "../../useGroundControl";

function Panel({
  title,
  headerAction,
  children,
}: {
  title: string;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-slate-200 bg-white py-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between px-3 pb-2 pt-3">
        <CardTitle className="text-[11px] font-black tracking-wide text-slate-700">
          {title}
        </CardTitle>
        {headerAction}
      </CardHeader>
      <CardContent className="px-3 pb-3">{children}</CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-[#f5faff] px-2 py-2">
      <div className="mb-1 text-[8px] font-medium text-slate-400">{label}</div>
      <span className="font-mono text-[12px] font-bold text-slate-600">{value}</span>
    </div>
  );
}

function Flag({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50 px-2 py-1.5">
      <span className="font-mono text-[9px] text-slate-500">{label}</span>
      <span
        className={`h-2 w-2 rounded-full ${ok ? "bg-green-500" : "bg-red-500"}`}
      />
    </div>
  );
}

function fmt(n: number | undefined | null, digits = 2, suffix = ""): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "--";
  return `${n.toFixed(digits)}${suffix}`;
}

// Perbandingan "PID" setpoint vs aktual -- PX4/MAVROS tidak menyediakan
// nilai gain P/I/D sebagai satu topic langsung, jadi yang ditampilkan di
// sini adalah SETPOINT (target dari flight controller/mission) vs AKTUAL
// (dari IMU) untuk attitude & rate -- ini yang paling dekat merepresentasikan
// "kerja PID" tanpa perlu ubah firmware.
export function PidPanel({
  telemetry,
  recording,
  recordedCount,
  onToggleRecording,
  disabled,
}: {
  telemetry: TelemetryData;
  recording: boolean;
  recordedCount: number;
  onToggleRecording: () => void;
  disabled: boolean;
}) {
  const target = telemetry.attitudeTarget;
  const actual = telemetry.imu;
  return (
    <Panel
      title="PID: SETPOINT VS AKTUAL"
      headerAction={
        <Button
          size="sm"
          variant={recording ? "destructive" : "outline"}
          disabled={disabled}
          onClick={onToggleRecording}
          className="h-7 text-[9px] font-bold"
        >
          {recording ? (
            <>
              <Disc size={11} className="mr-1 animate-pulse" />
              Stop & Unduh ({recordedCount})
            </>
          ) : (
            <>
              <Circle size={11} className="mr-1" />
              Record Orientasi & Translasi
            </>
          )}
        </Button>
      }
    >
      <div className="grid grid-cols-3 gap-2">
        <Metric label="ROLL (target/aktual)" value={`${fmt(target?.rollDeg, 1)}° / ${fmt(actual?.rollDeg, 1)}°`} />
        <Metric label="PITCH (target/aktual)" value={`${fmt(target?.pitchDeg, 1)}° / ${fmt(actual?.pitchDeg, 1)}°`} />
        <Metric label="YAW (target/aktual)" value={`${fmt(target?.yawDeg, 1)}° / ${fmt(actual?.yawDeg, 1)}°`} />
        <Metric label="ROLL RATE (target/aktual)" value={`${fmt(target?.rollRateDps, 1)} / ${fmt(actual?.gyroXDps, 1)} °/s`} />
        <Metric label="PITCH RATE (target/aktual)" value={`${fmt(target?.pitchRateDps, 1)} / ${fmt(actual?.gyroYDps, 1)} °/s`} />
        <Metric label="YAW RATE (target/aktual)" value={`${fmt(target?.yawRateDps, 1)} / ${fmt(actual?.gyroZDps, 1)} °/s`} />
      </div>
    </Panel>
  );
}

export function MotorPanel({ telemetry }: { telemetry: TelemetryData }) {
  const channels = telemetry.motorOut?.channels ?? [];
  const active = channels.filter((_, i) => i < 8);
  return (
    <Panel title="MOTOR / SERVO OUTPUT (PWM)">
      <div className="grid grid-cols-4 gap-2">
        {active.length === 0
          ? Array.from({ length: 4 }).map((_, i) => (
              <Metric key={i} label={`CH${i + 1}`} value="--" />
            ))
          : active.map((ch, i) => (
              <Metric key={i} label={`CH${i + 1}`} value={String(ch)} />
            ))}
      </div>
    </Panel>
  );
}

export function EkfPanel({ telemetry }: { telemetry: TelemetryData }) {
  const e = telemetry.estimatorStatus;
  return (
    <Panel title="EKF STATUS">
      <div className="grid grid-cols-2 gap-1.5">
        <Flag label="Attitude" ok={e?.attitude ?? false} />
        <Flag label="Velocity H" ok={e?.velocityHoriz ?? false} />
        <Flag label="Velocity V" ok={e?.velocityVert ?? false} />
        <Flag label="Pos H (rel)" ok={e?.posHorizRel ?? false} />
        <Flag label="Pos H (abs)" ok={e?.posHorizAbs ?? false} />
        <Flag label="Pos V (abs)" ok={e?.posVertAbs ?? false} />
        <Flag label="GPS glitch" ok={!(e?.gpsGlitch ?? true)} />
        <Flag label="Accel error" ok={!(e?.accelError ?? true)} />
      </div>
    </Panel>
  );
}

// 2026-09-16 (atas permintaan user, debug bug "altitude WP+batch+takeoff
// tidak mau turun ke target") -- 4 referensi altitude BERBEDA dari
// /mavros/altitude ditampilkan berdampingan, supaya operator langsung
// lihat kalau ada selisih antar referensi (yang jadi ROOT CAUSE bug itu --
// lihat fix armAndClimb() di flight_control.cpp, sekarang pakai
// bottomClearance/relative sebagai koreksi). bottomClearance disorot beda
// warna -- itu sumber PALING presisi di ketinggian rendah (TF Mini),
// terverifikasi live (nilai naik-turun akurat mengikuti ketinggian fisik
// saat diuji manual 2026-09-16).
export function AltitudePanel({ telemetry }: { telemetry: TelemetryData }) {
  const alt = telemetry.altitude;
  return (
    <Panel title="SUMBER ALTITUDE (referensi berbeda-beda)">
      <div className="grid grid-cols-2 gap-2">
        <Metric label="AMSL (absolut, laut)" value={fmt(alt?.amsl, 2, " m")} />
        <Metric label="LOCAL (Z lokal EKF)" value={fmt(alt?.local, 2, " m")} />
        <Metric label="RELATIVE (REL_HOME)" value={fmt(alt?.relative, 2, " m")} />
        <Metric label="TERRAIN (relatif tanah)" value={fmt(alt?.terrain, 2, " m")} />
      </div>
      <div className="mt-2 rounded-lg border border-amber-100 bg-amber-50 px-2 py-2">
        <div className="mb-1 text-[8px] font-medium text-amber-600">
          BOTTOM CLEARANCE (TF Mini -- paling presisi di ketinggian rendah)
        </div>
        <span className="font-mono text-[14px] font-bold text-amber-700">
          {fmt(alt?.bottomClearance, 2, " m")}
        </span>
      </div>
    </Panel>
  );
}

export function ImuBaroPanel({ telemetry }: { telemetry: TelemetryData }) {
  const imu = telemetry.imu;
  const baro = telemetry.baro;
  return (
    <Panel title="IMU & BAROMETER (mentah)">
      <div className="grid grid-cols-3 gap-2">
        <Metric label="ACCEL X" value={fmt(imu?.accelX, 2, " m/s²")} />
        <Metric label="ACCEL Y" value={fmt(imu?.accelY, 2, " m/s²")} />
        <Metric label="ACCEL Z" value={fmt(imu?.accelZ, 2, " m/s²")} />
        <Metric label="GYRO X" value={fmt(imu?.gyroXDps, 2, " °/s")} />
        <Metric label="GYRO Y" value={fmt(imu?.gyroYDps, 2, " °/s")} />
        <Metric label="GYRO Z" value={fmt(imu?.gyroZDps, 2, " °/s")} />
        <Metric label="BARO PRESSURE" value={fmt(baro?.pressureHpa, 1, " hPa")} />
      </div>
    </Panel>
  );
}
