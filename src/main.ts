import * as vscode from "vscode";
import pathToConfigHelper from "./utils/pathToConfig";
import pathToBunHelper from "./utils/pathToBun";
import { BunTestController } from "./BunTestController";
import { createLogger } from "./utils/logger";

// Define the tests API if it's not available in the vscode typings
// This is needed for VS Code versions before 1.59
if (!('tests' in vscode)) {
  // @ts-ignore
  vscode.tests = {
    createTestController(id: string, label: string): any {
      return {};
    }
  };
}

export async function activate(context: vscode.ExtensionContext) {
  const workspaceFolder = (vscode.workspace.workspaceFolders || [])[0];
  if (!workspaceFolder) {
    return;
  }

  // Create a simple logger using VS Code's built-in OutputChannel
  const outputChannel = vscode.window.createOutputChannel("Bun Test Explorer");
  const logger = createLogger(context, outputChannel);

  // Get the configuration options
  const pathToBun = () => {
    return vscode.workspace.getConfiguration("bunTestExplorer").get<string>("pathToBun")
      || pathToBunHelper(workspaceFolder);
  };
  const pathToConfig = () => {
    return vscode.workspace.getConfiguration("bunTestExplorer").get<string>("pathToBunConfig")
      || pathToConfigHelper();
  };

  try {
    // Create the test controller using the namespace API
    const controller = vscode.tests.createTestController(
      'bunTestController',
      'Bun Tests'
    );
    context.subscriptions.push(controller);

    // Create and initialize the test controller
    const bunTestController = new BunTestController(
      controller,
      workspaceFolder,
      logger,
      {
        pathToBun,
        pathToConfig,
      }
    );

    // Register the controller
    context.subscriptions.push(bunTestController);

    logger.info("Bun test controller registered successfully");
  } catch (error) {
    logger.error("Failed to initialize the test controller:", error);
    vscode.window.showErrorMessage("Failed to initialize Bun Test Explorer. You may need to update VS Code to version 1.59 or later.");
  }
}

export function deactivate() {
  // Clean up will be handled by the disposables
}
