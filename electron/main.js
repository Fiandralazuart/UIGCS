// Electron main process untuk membungkus UIGCS (Next.js) jadi aplikasi
// desktop -- TIDAK mengubah apa pun di sisi raspi, cuma membungkus server
// Next.js yang sama (produksi, hasil `next build`) di dalam window native.
const { app, BrowserWindow } = require("electron");

// 2026-09-19 (atas permintaan user): taskbar/dock menampilkan nama "uigcs"
// (dari package.json "name") + icon gear generik, BUKAN "SOERASKY Ground
// Control" + logo -- karena WM_CLASS Electron default diturunkan dari nama
// internal app, bukan productName/.desktop file. app.setName() HARUS
// dipanggil SEBELUM app.whenReady() supaya WM_CLASS/taskbar ikut benar.
app.setName("SOERASKY Ground Control");

// 2026-09-19 (atas permintaan user: "pastikan cuman bisa membuka satu
// aplikasi aja"): single-instance lock -- kalau user coba buka AppImage
///launcher kedua kalinya selagi instance PERTAMA masih jalan, instance
// KEDUA langsung exit (gagal dapat lock) alih-alih ikut jalan sebagai
// proses baru (yang tadinya bisa bikin 2 window + 2 server Next.js rebutan
// port 3000). Instance pertama yang menang lock, dan begitu ada percobaan
// buka kedua terdeteksi (event "second-instance"), window PERTAMA yang
// sudah ada di-fokuskan (bukan diam), supaya user tetap dapat feedback
// jelas "aplikasinya udah kebuka, ini dia".
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  // app.quit() async -- return di sini (sah di top-level CommonJS, module
  // Node dibungkus function) mencegah sisa file (spawn server kedua, buat
  // window kedua, dst) tetap sempat jalan sebelum quit benar-benar selesai.
  app.quit();
  return;
}

// 2026-09-17: ditemukan window muncul blank lalu langsung crash/quit di
// display X11 virtual/remote (VNC-like) -- GPU acceleration Electron
// default sering tidak kompatibel dengan compositor semacam ini.
// Dimatikan total supaya render selalu lewat software rasterizer, stabil
// di lingkungan display apa pun (desktop asli maupun remote).
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-software-rasterizer");
// PENTING: --no-sandbox HARUS dikirim sebagai argumen CLI asli saat
// binary electron dipanggil (native argv, dibaca SEBELUM skrip JS ini
// jalan) -- app.commandLine.appendSwitch("no-sandbox") TIDAK cukup untuk
// switch ini spesifik, terbukti tetap FATAL "SUID sandbox helper" walau
// sudah dipanggil di baris paling atas file ini. Diteruskan lewat argumen
// launcher (.desktop Exec=, dan package.json script "electron") yang
// SUDAH menyertakan --no-sandbox.
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");

const PORT = 3000;
const PROJECT_ROOT = path.join(__dirname, "..");

let nextProcess = null;
let mainWindow = null;

function waitForServer(url, callback) {
  const tryOnce = () => {
    http
      .get(url, () => callback())
      .on("error", () => setTimeout(tryOnce, 300));
  };
  tryOnce();
}

function startNextServer() {
  // 2026-09-17: DUA percobaan sebelumnya gagal --
  // (1) `npm run start` shell:true -- ENOTDIR (asar bikin path jadi
  //     virtual filesystem yang tidak bisa di-cwd oleh shell child_process).
  // (2) node_modules/.bin/next -- ENOENT: electron-builder SECARA DIAM-DIAM
  //     tidak menyertakan node_modules/.bin/ sama sekali (folder "dot" di-
  //     exclude default oleh matcher-nya, walau asar:false & files sudah
  //     eksplisit "node_modules/**/*").
  // FIX: panggil file ASLI next.js (target symlink .bin/next itu sendiri,
  // node_modules/next/dist/bin/next -- SELALU ada, bukan dot-folder) lewat
  // Node yang DIBUNDLE di dalam Electron sendiri (ELECTRON_RUN_AS_NODE=1),
  // BUKAN node_modules/.bin ATAU node/npm sistem -- jadi tidak bergantung
  // sama sekali pada apa yang ter-install di laptop/PATH pengguna.
  const nextCli = path.join(PROJECT_ROOT, "node_modules", "next", "dist", "bin", "next");
  nextProcess = spawn(process.execPath, [nextCli, "start", "-p", String(PORT)], {
    cwd: PROJECT_ROOT,
    shell: false,
    stdio: "ignore",
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    title: "SOERASKY Ground Control",
    icon: path.join(PROJECT_ROOT, "build", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
    },
  });
  mainWindow.loadURL(`http://localhost:${PORT}`);
}

app.whenReady().then(() => {
  startNextServer();
  waitForServer(`http://localhost:${PORT}`, createWindow);
});

// Percobaan buka instance KEDUA (lock gagal di proses itu, tapi ini event
// di instance PERTAMA yang menang lock) -- fokuskan window yang SUDAH ada,
// jangan biarkan diam tanpa respons.
app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (nextProcess) {
    nextProcess.kill();
    nextProcess = null;
  }
});
