/**
 * Build-time app version for health checks.
 */
import { readFileSync } from "fs";
import path from "path";

let _version: string = "";

export function getAppVersion(): string {
  if (_version) return _version;
  try {
    const pkgPath = path.join(process.cwd(), "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    _version = typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    _version = "0.0.0";
  }
  return _version;
}
