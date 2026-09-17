import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ssh2 (dipakai src/lib/ssh-manager.ts) punya native/crypto internals
  // yang gagal di-bundle Turbopack ke dalam chunk Route Handler -- keluarkan
  // dari bundling, pakai require() Node biasa saat runtime.
  serverExternalPackages: ["ssh2"],
};

export default nextConfig;
