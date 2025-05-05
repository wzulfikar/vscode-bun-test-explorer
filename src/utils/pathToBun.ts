import { existsSync } from "fs";
import { join } from "path";
import { WorkspaceFolder } from "vscode";
import * as os from "os";

export default function pathToBun(workspace: WorkspaceFolder): string {
  // Then check for Bun executable
  const bunPath = pathToBunExecutable();
  if (existsSync(bunPath)) {
    return bunPath;
  }
  // Fallback to just "bun" which will use PATH resolution
  return "bun";
}

function pathToBunExecutable(): string {
  const platform = os.platform();
  const homeDir = os.homedir();

  if (platform === "win32") {
    // Windows path to Bun
    return join(homeDir, ".bun", "bin", "bun.exe");
  } else if (platform === "darwin" || platform === "linux") {
    // macOS and Linux path to Bun
    return join(homeDir, ".bun", "bin", "bun");
  }

  // Fallback to global command
  return "bun";
}
