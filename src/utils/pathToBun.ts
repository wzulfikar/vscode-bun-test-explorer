import { existsSync } from "fs";
import { join } from "path";
import { WorkspaceFolder } from "vscode";
import * as os from "os";

export default function pathToBun(workspace: WorkspaceFolder): string {
  // Then check for Bun executable
  const bunPaths = pathsToBunExecutable();
  for (const bunPath of bunPaths) {
    if (existsSync(bunPath)) {
      return bunPath;
    }
  }
  // Fallback to just "bun" which will use PATH resolution
  return "bun";
}

function pathsToBunExecutable(): string[] {
  const platform = os.platform();
  const homeDir = os.homedir();

  if (platform === "win32") {
    // Windows path to Bun
    return [join(homeDir, ".bun", "bin", "bun.exe")];
  } else if (platform === "darwin" || platform === "linux") {
    // macOS and Linux path to Bun
    const bunPaths = [join(homeDir, ".bun", "bin", "bun")];
    if (platform === "darwin") {
      // Add Homebrew paths for both Apple Silicon and Intel Macs
      bunPaths.push("/opt/homebrew/bin/bun");
      bunPaths.push("/usr/local/bin/bun");
    }
    return bunPaths;
  }

  return [];
}
