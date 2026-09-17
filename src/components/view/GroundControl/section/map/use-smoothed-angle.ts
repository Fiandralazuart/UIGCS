"use client";

import { useEffect, useRef, useState } from "react";

// Filter EMA (exponential moving average) buat sudut (derajat) -- meredam
// noise sensor IMU kecil yang bikin jarum/horizon terus bergetar walau
// drone diam, dan bikin transisi antar update telemetry (1Hz) terasa halus
// lewat CSS transition di komponen pemanggil, bukan "loncat" tiap tick.
// Wraparound (mis. heading 359° -> 1°) ditangani dengan "unwrap" nilai
// mentah relatif ke nilai smoothed sebelumnya SEBELUM di-EMA, supaya jarum
// tidak muter jauh lewat 0°/360° saat crossing.
export function useSmoothedAngle(raw: number | null, alpha = 0.25): number | null {
  const [smoothed, setSmoothed] = useState<number | null>(raw);
  const prevRef = useRef<number | null>(raw);

  useEffect(() => {
    if (raw === null) return;
    const prev = prevRef.current;
    if (prev === null) {
      prevRef.current = raw;
      setSmoothed(raw);
      return;
    }
    let delta = raw - prev;
    delta = ((delta + 180) % 360 + 360) % 360 - 180; // unwrap ke [-180, 180]
    const unwrapped = prev + delta;
    const next = prev + alpha * (unwrapped - prev);
    prevRef.current = next;
    setSmoothed(next);
  }, [raw, alpha]);

  return smoothed;
}
