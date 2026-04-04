#!/usr/bin/env tsx
/**
 * Kills any process using port 3000. Cross-platform (Windows, Unix).
 */
import { execSync } from "child_process";
import { platform } from "os";

const PORT = 3000;

try {
  if (platform() === "win32") {
    let out: string;
    try {
      out = execSync(`netstat -ano | findstr :${PORT}`, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    } catch {
      console.log(`Port ${PORT} is already free`);
      process.exit(0);
    }
    const pids = new Set<string>();
    for (const line of out.split("\n")) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && /^\d+$/.test(pid) && pid !== "0") pids.add(pid);
    }
    for (const pid of pids) {
      execSync(`taskkill /PID ${pid} /F`, { stdio: "inherit" });
      console.log(`Killed PID ${pid}`);
    }
    if (pids.size === 0 && out) console.log("No processes to kill (or port already free)");
  } else {
    try {
      execSync(`lsof -ti:${PORT} | xargs kill -9`, { stdio: "inherit" });
    } catch {
      // xargs exits 123 when no input; lsof exits 1 when nothing found
    }
    console.log(`Freed port ${PORT}`);
  }
} catch (e: unknown) {
  if (typeof e === "object" && e !== null && "status" in e && (e as { status: number }).status === 1) {
    console.log(`Port ${PORT} is already free`);
  } else {
    throw e;
  }
}
