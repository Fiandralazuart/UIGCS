"use client";

import { useSmoothedAngle } from "./use-smoothed-angle";

// Instrumen gabungan gaya QGC: artificial horizon (dengan pitch ladder +
// pointer roll) di atas, compass (heading) di bawah -- dua LINGKARAN
// bertumpuk.
//
// Riwayat perbaikan (feedback user) --
// 1) Arah rotasi horizon: `rotate(${roll}deg)` TANPA dibalik (gaya widget
//    QGC -- rotasi background langsung sebesar sudut roll).
// 2) CSS transition di elemen yang berputar/geser supaya gerakan antar
//    update telemetry (1Hz) HALUS, tidak "patah-patah"/loncat.
// 3) Nilai roll/pitch/heading di-smooth (EMA, lihat use-smoothed-angle.ts).
// 4) Dua lingkaran penuh (rounded-full), bukan kotak sudut membulat.
// 5) 2026-09-14 (bug nyata dilaporkan user, screenshot menunjukkan horizon
//    jadi bentuk wedge/pie, BUKAN setengah lingkaran penuh): root cause --
//    SATU div dengan `translate(...) rotate(...)` gabungan. CSS transform
//    dieksekusi kanan-ke-kiri (rotate DULU baru translate, TAPI translate
//    di sini pakai unit px, jadi habis di-rotate arah geser pitch-nya ikut
//    miring sesuai roll, bukan geser vertikal murni relatif ke horizon --
//    ditambah offset -50%/-50% dari translate yang SAMA dicampur dengan
//    offset px pitch, pivotnya jadi tidak lagi persis di tengah lingkaran
//    saat pitch != 0, hasilnya potongan sky/ground yang terlihat jadi
//    "terpotong miring" (wedge), bukan overlay penuh 260%x260% yang
//    seharusnya menutupi seluruh lingkaran di sudut rotasi mana pun.
//    Diperbaiki dengan DUA LAYER NESTED terpisah: layer luar CUMA rotate
//    (roll), layer dalam (anak dari layer luar, jadi ikut ter-rotate)
//    CUMA translateY (pitch) -- pola standar rendering ADI, masing-masing
//    transform independen jadi tidak saling ganggu pivot satu sama lain.
function PitchLadder({ pitchPxPerDeg }: { pitchPxPerDeg: number }) {
  const marks = [-20, -10, 10, 20];
  return (
    <>
      {marks.map((deg) => (
        <div
          key={deg}
          className="absolute left-1/2 flex -translate-x-1/2 items-center gap-1"
          style={{ top: `calc(50% - ${deg * pitchPxPerDeg}px)` }}
        >
          <span className="font-mono text-[8px] font-bold text-white">{deg > 0 ? deg : ""}</span>
          <span className="h-px w-5 bg-white" />
          <span className="font-mono text-[8px] font-bold text-white">{deg < 0 ? deg : ""}</span>
        </div>
      ))}
    </>
  );
}

export function FlightInstrument({
  rollDeg,
  pitchDeg,
  headingDeg,
}: {
  rollDeg: number | null;
  pitchDeg: number | null;
  headingDeg: number | null;
}) {
  const smoothedRoll = useSmoothedAngle(rollDeg);
  const smoothedPitch = useSmoothedAngle(pitchDeg);
  const smoothedHeading = useSmoothedAngle(headingDeg);
  const roll = smoothedRoll ?? 0;
  const pitch = smoothedPitch ?? 0;
  const heading = smoothedHeading ?? 0;
  const pxPerDeg = 2.2;
  const pitchOffsetPx = Math.max(-45, Math.min(45, pitch * pxPerDeg));

  return (
    <div className="flex w-[176px] flex-col items-center gap-2">
      {/* Artificial horizon -- LINGKARAN PENUH */}
      <div className="relative aspect-square w-full overflow-hidden rounded-full shadow-lg ring-[3px] ring-white">
        {/* Layer luar: CUMA rotate (roll). Dibesarkan via inset:-100%
            (jadi 3x ukuran viewport, dipusatkan) -- cukup besar supaya
            di sudut rotasi mana pun (termasuk 45deg, kondisi terburuk)
            tetap menutupi seluruh lingkaran viewport tanpa celah. */}
        <div
          className="absolute inset-[-100%] transition-transform duration-300 ease-out"
          style={{ transform: `rotate(${roll}deg)` }}
        >
          {/* Layer dalam: CUMA translateY (pitch), ikut ter-rotate bareng
              parent-nya (rotasi roll berlaku duluan di layer luar) --
              transform terpisah, jadi pivotnya tidak saling ganggu. */}
          <div
            className="absolute inset-0 transition-transform duration-300 ease-out"
            style={{ transform: `translateY(${pitchOffsetPx}px)` }}
          >
            <div className="absolute inset-0 flex flex-col">
              <div className="h-1/2 w-full bg-[#4a90d9]" />
              <div className="h-1/2 w-full bg-[#5c8f3e]" />
            </div>
            <div className="absolute left-0 right-0 top-1/2 h-[2px] -translate-y-1/2 bg-[#7a1f1f]" />
            <PitchLadder pitchPxPerDeg={pxPerDeg} />
          </div>
        </div>
        {/* Roll scale tick di tepi lingkaran (tetap, tidak ikut berputar) --
            spoke tak-terlihat dari titik pusat (buat pivot rotasi yang
            benar), garis tick pendek cuma digambar di ujung dekat tepi. */}
        {[-30, -20, -10, 0, 10, 20, 30].map((deg) => (
          <div
            key={deg}
            className="absolute left-1/2 top-1/2 h-[48%] w-px origin-bottom"
            style={{ transform: `translate(-50%, -100%) rotate(${deg}deg)` }}
          >
            <div className="absolute top-0 h-2 w-px bg-white" />
          </div>
        ))}
        {/* Pointer roll tetap (segitiga merah di atas) */}
        <div className="absolute left-1/2 top-1 -translate-x-1/2">
          <div className="h-0 w-0 border-x-[5px] border-t-[7px] border-x-transparent border-t-red-600" />
        </div>
        {/* Simbol pesawat acuan tetap di tengah -- sayap kecil + titik
            hidung, gaya ADI klasik. */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="flex items-center">
            <div className="h-[2px] w-6 rounded-full bg-slate-800" />
            <div className="mx-0.5 h-1.5 w-1.5 rounded-full bg-slate-800" />
            <div className="h-[2px] w-6 rounded-full bg-slate-800" />
          </div>
        </div>
      </div>

      {/* Compass / heading -- LINGKARAN PENUH, sedikit overlap di leher
          supaya menyatu visual dengan horizon di atasnya. */}
      <div className="relative aspect-square w-[84%] overflow-hidden rounded-full bg-[#0d1117] shadow-lg ring-[3px] ring-white">
        {(["N", "E", "S", "W"] as const).map((dir, i) => (
          <span
            key={dir}
            className="absolute text-[9px] font-black text-white/60"
            style={{
              top: i === 0 ? "10%" : i === 2 ? "auto" : "50%",
              bottom: i === 2 ? "10%" : "auto",
              left: i === 3 ? "12%" : i === 1 ? "auto" : "50%",
              right: i === 1 ? "12%" : "auto",
              transform: i === 0 || i === 2 ? "translateX(-50%)" : "translateY(-50%)",
            }}
          >
            {dir}
          </span>
        ))}
        <div
          className="absolute left-1/2 top-1/2 origin-center transition-transform duration-300 ease-out"
          style={{ transform: `translate(-50%, -50%) rotate(${heading}deg)` }}
        >
          <div className="flex flex-col items-center">
            <div className="h-0 w-0 border-x-[10px] border-b-[28px] border-x-transparent border-b-red-600" />
            <div className="h-0 w-0 border-x-[10px] border-t-[28px] border-x-transparent border-t-[#6b1f1f]" />
          </div>
        </div>
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 font-mono text-[11px] font-bold text-white">
          {headingDeg === null ? "--" : `${Math.round(heading)}°`}
        </div>
      </div>
    </div>
  );
}
