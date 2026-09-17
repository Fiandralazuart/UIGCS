# UIGCS — SOERASKY Ground Control

UIGCS (SOERASKY Ground Control) adalah aplikasi Ground Control Station (GCS)
berbasis [Next.js](https://nextjs.org), dibungkus jadi aplikasi desktop
dengan [Electron](https://www.electronjs.org/). Aplikasi ini menyambungkan
laptop operator ke Raspberry Pi di wahana (drone/rover) lewat SSH untuk
mengontrol dan memantau service ROS2 (MAVROS, Vision, Mission, Livox, dsb),
menampilkan telemetry & peta misi secara real-time, serta mengatur relay RTK
antara laptop dan raspi.

## Fitur

- **Koneksi SSH ke Raspberry Pi** — connect/disconnect, cek status service.
- **Kontrol service** — start/stop MAVROS, Vision, Mission, Livox, LCD,
  flight logger, dan lain-lain langsung dari UI.
- **Peta & instrumen penerbangan** — peta Leaflet (dengan dukungan tile
  offline), indikator sikap/heading, panel data flight.
- **Manajemen misi** — tambah/ambil/hapus waypoint, retry mission, build
  ulang file misi (YAML).
- **Kamera** — streaming MJPEG dari raspi lewat port-forward SSH.
- **RTK GPS** — mengontrol relay RTK dua sisi (laptop base ⇄ raspi rover)
  lewat skrip eksternal `~/rtk_gateway`.
- **Log viewer** — log per-service (mission, RTK, waypoint, dll) secara
  real-time.
- **Desktop app (Electron)** — dibungkus jadi aplikasi native Linux
  (AppImage) tanpa mengubah cara kerja server Next.js-nya.

## Prasyarat

- **Node.js 20 atau lebih baru** dan npm (disarankan menggunakan versi LTS
  terbaru; proyek ini dikembangkan dengan Node.js 24).
- **Linux** untuk build Electron/AppImage (target build saat ini hanya
  `linux`/AppImage). Menjalankan `next dev`/`next build` biasa juga bisa di
  OS lain.
- Akses jaringan/Wi-Fi ke Raspberry Pi yang menjalankan service ROS2 terkait
  (MAVROS, Vision, Mission, Livox, dst.) — kredensial SSH (host, username,
  password) diinput langsung dari UI saat runtime, **tidak** disimpan di
  file `.env`.
- (Opsional, hanya untuk fitur RTK) Direktori `~/rtk_gateway` berisi skrip
  `laptop/start.sh` — lihat `~/rtk_gateway/README.md` untuk detail
  hardware (F9P base/rover) dan cara setup jalur RTK. Tanpa direktori ini,
  fitur RTK tidak akan bisa dijalankan, tapi fitur lain tetap berfungsi
  normal.

## Instalasi

1. Clone repository:

   ```bash
   git clone <url-repo-ini>
   cd UIGCS-main
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

## Menjalankan sebagai Web App (mode development)

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000) di browser.

## Build untuk production (web)

```bash
npm run build
npm run start
```

`npm run start` akan menjalankan server Next.js hasil build di
`http://localhost:3000`.

## Menjalankan sebagai Desktop App (Electron)

Electron membungkus server Next.js production yang sama, jadi build dulu
sebelum menjalankan mode Electron:

```bash
npm run build
npm run electron
```

Ini akan otomatis menjalankan server Next.js hasil build lalu membuka
window desktop (`SOERASKY Ground Control`).

## Build installer/AppImage

```bash
npm run electron:build
```

Perintah ini menjalankan `next build` lalu `electron-builder`, menghasilkan
AppImage Linux di folder `dist/` (lihat konfigurasi `build` pada
`package.json` — `appId: com.soerasky.groundcontrol`).

## Lint

```bash
npm run lint
```

## Struktur proyek

```
electron/           # Proses utama Electron (main.js) — membungkus server Next.js
src/
  app/
    api/             # Route handler Next.js (SSH, mission, RTK, telemetry, logs)
    page.tsx         # Entry halaman utama
  components/
    ui/              # Komponen UI dasar (shadcn-based)
    view/GroundControl/  # Komponen utama GCS (peta, mission, camera, dll)
  lib/
    ssh-manager.ts   # Koneksi & kontrol service via SSH ke raspi
    rtk-manager.ts   # Kontrol proses RTK di sisi laptop
    mission-yaml.ts  # Parsing/pembuatan file konfigurasi misi (YAML)
build/               # Aset build Electron (icon, dst.)
```

## Tech stack

- [Next.js](https://nextjs.org) 16 (App Router) + React 19
- [Electron](https://www.electronjs.org/) untuk pembungkusan desktop
- [Tailwind CSS](https://tailwindcss.com) + [shadcn](https://ui.shadcn.com)
- [Leaflet](https://leafletjs.com) + `leaflet.offline` untuk peta
- [ssh2](https://github.com/mscdex/ssh2) untuk koneksi SSH ke raspi

## Catatan

- Kredensial SSH tidak pernah disimpan secara persisten oleh aplikasi ini —
  dimasukkan lewat UI setiap sesi.
- Modul `src/lib/ssh-manager.ts` dan `src/lib/rtk-manager.ts` bersifat
  server-only dan **tidak boleh** diimpor dari komponen `"use client"`.
- Fitur RTK bergantung pada skrip eksternal di `~/rtk_gateway` pada laptop
  operator (di luar repo ini).
