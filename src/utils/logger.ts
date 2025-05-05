import * as vscode from "vscode";

export interface Logger {
  info(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
}

export function createLogger(extensionContext: vscode.ExtensionContext, outputChannel: vscode.OutputChannel) {
  extensionContext.subscriptions.push(outputChannel);

  const logger = {
    info: (message: string, ...args: any[]) => {
      outputChannel.appendLine(`[INFO] ${message} ${args.length ? JSON.stringify(args) : ''}`);
    },
    error: (message: string, ...args: any[]) => {
      outputChannel.appendLine(`[ERROR] ${message} ${args.length ? JSON.stringify(args) : ''}`);
    },
    warn: (message: string, ...args: any[]) => {
      outputChannel.appendLine(`[WARN] ${message} ${args.length ? JSON.stringify(args) : ''}`);
    }
  };

  return logger;
}
