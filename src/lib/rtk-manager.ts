// Server-only module -- RTK runs LOCALLY on this laptop (NOT via SSH),
// spawning the existing ~/rtk_gateway/laptop/start.sh script directly.
// See ~/rtk_gateway/README.md for what that script does.

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import os from "node:os";
import path from "node:path";

export type RtkStatus = "stopped" | "starting" | "running" | "stopping" | "error";

const MAX_LOG_LINES = 500;
const START_SCRIPT = path.join(os.homedir(), "rtk_gateway", "laptop", "start.sh");

interface GlobalRtkState {
  status: RtkStatus;
  startedAt: number | null;
  child: ChildProcessWithoutNullStreams | null;
  logs: string[];
  // Runner yang TERAKHIR dipakai untuk start -- dibaca stopRtk() supaya
  // pkill dengan pattern yang benar (rtk_base_forward.py vs str2str).
  runner: "udp" | "str2str";
}

const g = globalThis as unknown as { __rtkState?: GlobalRtkState };

function state(): GlobalRtkState {
  if (!g.__rtkState) {
    g.__rtkState = { status: "stopped", startedAt: null, child: null, logs: [], runner: "udp" };
  }
  return g.__rtkState;
}

function appendLog(line: string) {
  const s = state();
  for (const part of line.split("\n")) {
    const trimmed = part.replace(/\r$/, "");
    if (trimmed.length === 0) continue;
    s.logs.push(trimmed);
  }
  while (s.logs.length > MAX_LOG_LINES) s.logs.shift();
}

export function getRtkStatus() {
  const s = state();
  return { status: s.status, startedAt: s.startedAt, runner: s.runner };
}

export function getRtkLogs(): string[] {
  return [...state().logs];
}

// runner:="udp" (default, rtk_base_forward.py, broadcast ke 2 IP raspi) atau
// "str2str" (RTKLIB, TCP client ke SATU IP -- WAJIB isi dest). Switch ini
// (2026-09-16, atas permintaan user) murni pilihan RUNNER, TIDAK mengubah
// perilaku default sama sekali kalau runner diabaikan/"udp" -- lihat
// ~/rtk_gateway/laptop/start.sh.
export function startRtk(
  runner: "udp" | "str2str" = "udp",
  dest?: string,
): { ok: true } | { ok: false; error: string } {
  const s = state();
  if (s.status === "running" || s.status === "starting") {
    return { ok: false, error: "RTK sudah jalan/sedang start." };
  }
  if (runner === "str2str" && !dest) {
    return { ok: false, error: "runner:=str2str butuh dest (IP raspi tujuan)." };
  }
  const args = ["rtk:=true"];
  if (runner === "str2str") {
    args.push("runner:=str2str", `dest:=${dest}`);
  }
  s.runner = runner;
  s.status = "starting";
  appendLog(`[system] Menjalankan: ${START_SCRIPT} ${args.join(" ")}`);
  // start.sh sendiri men-daemonize (nohup ... &) proses rtk_base_forward.py/
  // str2str, jadi child di sini cuma wrapper singkat yang keluar begitu
  // selesai spawn -- statusnya kita tandai "running" begitu wrapper exit 0.
  const child = spawn("bash", [START_SCRIPT, ...args], {
    cwd: path.dirname(START_SCRIPT),
  });
  s.child = child;
  child.stdout.on("data", (d: Buffer) => appendLog(d.toString("utf8")));
  child.stderr.on("data", (d: Buffer) => appendLog(d.toString("utf8")));
  child.on("exit", (code) => {
    if (code === 0) {
      s.status = "running";
      s.startedAt = Date.now();
      appendLog(
        `[system] ${runner === "str2str" ? "str2str" : "rtk_base_forward.py"} dimulai (background).`,
      );
    } else {
      s.status = "error";
      appendLog(`[system] start.sh keluar dengan kode ${code}.`);
    }
  });
  child.on("error", (err) => {
    s.status = "error";
    appendLog(`[system] Gagal menjalankan start.sh: ${err.message}`);
  });
  return { ok: true };
}

export function stopRtk(): { ok: true } | { ok: false; error: string } {
  const s = state();
  if (s.status !== "running") {
    return { ok: false, error: "RTK tidak sedang berjalan." };
  }
  s.status = "stopping";
  // Pattern HARUS sesuai runner yang benar-benar dipakai saat start
  // (s.runner) -- "str2str -in" (bukan cuma "str2str") supaya tidak match
  // command line pkill/proses lain yang kebetulan mengandung substring
  // "str2str" (lihat bug serupa yang ditemukan+diperbaiki di
  // ~/rtk_gateway/*/start.sh, 2026-09-16).
  const pattern = s.runner === "str2str" ? "str2str -in" : "rtk_base_forward.py";
  appendLog(`[system] Menghentikan ${pattern} (pkill by pattern)...`);
  // start.sh men-daemonize prosesnya (nohup ... & disown), jadi kita tidak
  // punya PID langsung dari child wrapper di atas -- hentikan lewat pattern
  // match nama scriptnya sendiri.
  const killer = spawn("pkill", ["-f", pattern]);
  killer.on("exit", () => {
    s.status = "stopped";
    s.startedAt = null;
    s.child = null;
    appendLog("[system] RTK dihentikan.");
  });
  return { ok: true };
}
