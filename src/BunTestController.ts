import * as vscode from "vscode";
import { spawn } from 'child_process';
import { platform } from "os";
import { Logger } from "./utils/logger";
import { BunFileResult, BunTestResponse, BunTestResult } from "./types";
import { parseBunTestOutput } from "./utils/parseBunTestOutput";
import { isRelatedTestResult } from "./utils/isRelatedTestResult";

// Type definitions for VSCode Testing API
class TestTag {
  constructor(public readonly id: string) { }
}

interface TestItem {
  id: string;
  label: string;
  uri?: vscode.Uri;
  tags: TestTag[];
  children: TestItemCollection;
  range?: vscode.Range;
}

interface TestItemCollection {
  size: number;
  replace(items: TestItem[]): void;
  forEach(callback: (item: TestItem) => void): void;
  add(item: TestItem): void;
  delete(id: string): void;
  get(id: string): TestItem | undefined;
  values(): IterableIterator<TestItem>;
}

export interface BunTestControllerOptions {
  pathToConfig: () => string;
  pathToBun: () => string;
}

export class BunTestController implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private activeProcesses: Set<{ process: any, kill: () => void }> = new Set();
  private testArgs = ['test'];

  constructor(
    private readonly testController: vscode.TestController,
    private readonly workspaceFolder: vscode.WorkspaceFolder,
    private readonly log: Logger,
    private readonly options: BunTestControllerOptions,
  ) {
    this.log.info("Initializing BunTestController with native VSCode API");
    this.log.info(`Workspace folder: ${workspaceFolder.uri.fsPath}`);
    this.log.info(`Bun path: ${this.options.pathToBun()}`);

    // Set up the resolve handler to load tests on demand
    this.testController.resolveHandler = async (testItem) => {
      await this.discoverTests(testItem);
    };

    // Create the run profile for running tests
    this.testController.createRunProfile(
      'Run Test',
      vscode.TestRunProfileKind.Run,
      (request, token) => this.runHandler(request, token, false),
      true
    );

    // Create the run profile for debugging tests
    this.testController.createRunProfile(
      'Debug',
      vscode.TestRunProfileKind.Debug,
      (request, token) => this.runHandler(request, token, true),
      true
    );

    this.log.info("Test profiles created successfully");

    // Set up file watchers to refresh tests when files change
    this.setupWatchers();

    // Initial test discovery
    this.discoverTests();
  }

  private setupWatchers(): void {
    // Watch for test file changes
    const fileWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(this.workspaceFolder, '**/*.{test,spec}.{js,jsx,ts,tsx}')
    );

    const refreshTestsForFile = (uri: vscode.Uri) => {
      const existing = this.testController.items.get(uri.toString());
      if (existing) {
        existing.children.replace([]);
        this.discoverTests(existing);
      } else {
        this.discoverTests();
      }
    };

    fileWatcher.onDidChange(refreshTestsForFile);
    fileWatcher.onDidCreate(refreshTestsForFile);
    fileWatcher.onDidDelete(uri => {
      const existing = this.testController.items.get(uri.toString());
      if (existing) {
        this.testController.items.delete(existing.id);
      }
    });

    this.disposables.push(fileWatcher);
  }

  private async discoverTests(testItem?: vscode.TestItem): Promise<void> {
    this.log.info(`Discovering tests${testItem ? ` for ${testItem.id}` : ''}`);

    try {
      // Run Bun tests with the new path
      const bunPath = this.options.pathToBun();
      if (!bunPath) {
        this.log.error("No Bun executable path found");
        vscode.window.showErrorMessage("Could not find Bun executable. Please check your configuration.");
        return;
      }

      const stdout = await this.runBunProcess(this.testArgs);
      if (!stdout) {
        this.log.error("No response from Bun test command");
        return;
      }

      // Log the response to help with debugging
      this.log.info(`Bun test response (first 200 chars): ${stdout.substring(0, 200)}...`);

      const parsedOutput = parseBunTestOutput(stdout, this.workspaceFolder.uri.fsPath);
      if (!parsedOutput || !parsedOutput.results || !parsedOutput.results.testResults) {
        this.log.error("Failed to parse test output");
        this.log.info("Raw response:", stdout);
        return;
      }

      // Log the number of tests found
      const totalTests = parsedOutput.results.testResults.reduce(
        (total, file) => total + this.countTests(file.tests), 0
      );
      this.log.info(`Found ${totalTests} tests across ${parsedOutput.results.testResults.length} files`);

      // Create the test items
      this.createTestItems(parsedOutput, testItem);
    } catch (error) {
      // Common errors:
      // - Error discovering tests: Error: Illegal argument: line must be non-negative
      this.log.error(`Error discovering tests: ${error}`);
      vscode.window.showErrorMessage(`Error discovering tests: ${error}`);
    }
  }

  private countTests(tests: BunTestResult[]): number {
    let count = 0;
    for (const test of tests) {
      if (test.children && test.children.length > 0) {
        count += this.countTests(test.children);
      } else {
        count++;
      }
    }
    return count;
  }

  private createTestItems(response: BunTestResponse, parent?: vscode.TestItem): void {
    if (!parent) {
      // Add or update root level test items
      for (const fileResult of response.results.testResults) {
        // Create or get file test item
        const fileUri = vscode.Uri.file(fileResult.name);
        let fileTestItem = this.testController.items.get(fileUri.toString());

        if (!fileTestItem) {
          fileTestItem = this.testController.createTestItem(
            fileUri.toString(),
            fileResult.name.split('/').pop() || fileResult.name,
            fileUri
          );
          this.testController.items.add(fileTestItem);
        }

        // Create test items for this file
        this.createTestItemsForFile(fileResult, fileTestItem);
      }
    } else {
      // We're resolving a specific test item
      const fileUri = parent.uri!;
      const fileResult = response.results.testResults.find(
        (result: BunFileResult) => result.name === fileUri.fsPath
      );

      if (fileResult) {
        this.createTestItemsForFile(fileResult, parent);
      }
    }
  }

  private createTestItemsForFile(fileResult: BunFileResult, fileTestItem: vscode.TestItem): void {
    // Clear existing children
    fileTestItem.children.replace([]);

    // Process test hierarchy
    this.addTestChildren(fileResult.tests, fileTestItem, fileResult.name);
  }

  private addTestChildren(
    tests: BunTestResult[],
    parent: vscode.TestItem,
    fileName: string,
    parentPath: string = ''
  ): void {
    for (const test of tests) {
      const path = parentPath ? `${parentPath} > ${test.name}` : test.name;
      const testId = `${fileName}#${path}`;

      let location: vscode.Location | undefined = undefined;
      if (test.location && test.location.line > 0) {
        // Ensure line is positive (VSCode uses 0-based lines)
        const line = Math.max(0, test.location.line - 1);
        const column = Math.max(0, test.location.column);
        location = new vscode.Location(
          parent.uri!,
          new vscode.Position(line, column)
        );
      }

      const testItem = this.testController.createTestItem(
        testId,
        test.name,
        parent.uri
      );

      if (testId.includes('tests skipped')) {
        this.log.info(`skipped test:`, test);
      }

      if (location) {
        testItem.range = new vscode.Range(
          location.range.start,
          location.range.start.translate(0, test.name.length)
        );
      }

      parent.children.add(testItem);

      // If this test has children, it's a suite/describe block
      if (test.children && test.children.length > 0) {
        this.addTestChildren(test.children, testItem, fileName, path);
      }
    }
  }

  private async runHandler(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken,
    isDebug: boolean
  ): Promise<void> {
    this.log.info(`runHandler:`, request.include);
    const run = this.testController.createTestRun(request);

    token.onCancellationRequested(() => {
      run.end();
      this.closeAllActiveProcesses();
    });

    const queue: vscode.TestItem[] = [];

    // If specific tests are specified to run
    if (request.include) {
      const testLabels = request.include.map(test => test.label);
      this.log.info(`Running specific test:`, testLabels);
      request.include.forEach(test => queue.push(test));
    } else {
      // Run all discovered tests
      this.log.info(`Running all discovered tests:`, this.testController.items.size);
      this.testController.items.forEach(test => queue.push(test));
    }

    // If debugging, handle it differently
    if (isDebug) {
      await this.debugTests(queue, request, run);
      run.end();
      return;
    }

    // Group tests by file for more efficient execution
    const testsByFile = new Map<string, vscode.TestItem[]>();

    for (const test of queue) {
      if (!test.uri) {
        this.log.error('runHandler: test item has no URI', test);
        continue;
      };

      // Get the file path
      const filePath = test.uri.fsPath;
      if (!testsByFile.has(filePath)) {
        testsByFile.set(filePath, []);
      }
      testsByFile.get(filePath)!.push(test);
    }

    // Run tests file by file
    for (const [filePath, tests] of testsByFile.entries()) {
      if (token.isCancellationRequested) break;

      this.log.info('Running tests for file:', filePath, tests);

      try {
        // Mark tests as running
        for (const test of tests) {
          run.started(test);
          this.markTestsAsRunning(test, run);
        }

        // Prepare args for the specific file
        const args = this.testArgs.concat([filePath]);

        // Check if we're running the entire file or specific tests
        // A test item is a file-level item if its id is the same as its uri.toString()
        // and it has no '#' character in the id
        const testUriString = tests[0].uri?.toString();
        const testIdEndsWithFileName = tests[0].uri && tests[0].label === tests[0].uri.fsPath.split('/').pop();

        // A better check for file-level test items:
        // 1. First check if the label exactly matches the filename
        // 2. Or if the id doesn't contain a test name (no # character)
        // 3. Or if the id exactly matches the uri string
        const isFileOnly = tests.length === 1 &&
          tests[0].uri &&
          (testIdEndsWithFileName ||
            !tests[0].id.includes('#') ||
            tests[0].id === testUriString);

        if (!isFileOnly) {
          // We need to run specific tests, so collect test name patterns
          const testNamePatterns = this.getTestNamePatterns(tests);
          const testNames = testNamePatterns.map(pattern => pattern.split(' > ')?.pop() || pattern);

          if (testNamePatterns.length > 0) {
            const testNamesRegex = testNames.map(pattern => `(${pattern})`).join('|');
            args.push('--test-name-pattern', testNamesRegex);
          }
        }

        // Run Bun tests and get both stdout and the JUnit XML
        const stdout = await this.runBunProcess(args);
        if (!stdout) {
          this.log.error(`skipping: No response from Bun test command for ${filePath}`);
          tests.forEach(test => run.skipped(test));
          continue;
        }

        // Convert absolute path to relative path for better DX
        const relativePath = filePath.replace(this.workspaceFolder.uri.fsPath + '/', '');
        const displayArgs = args.map(arg => arg === filePath ? relativePath : arg);
        const [command, ...commandArgs] = displayArgs;
        const commandArgsWithQuotedParams = commandArgs.map(arg => arg.startsWith('--') ? arg : `'${arg}'`).join(' ')
        run.appendOutput(`\r\n\x1b[2mbun ${command} ${commandArgsWithQuotedParams}\x1b[0m`);

        const parsedOutput = parseBunTestOutput(stdout, this.workspaceFolder.uri.fsPath);

        if (!parsedOutput || !parsedOutput.results || !parsedOutput.results.testResults) {
          tests.forEach(test => {
            run.errored(test, new vscode.TestMessage("Failed to parse test output"));
            // Add output for individual test
            if (test.uri) {
              const location = new vscode.Location(test.uri, new vscode.Position(0, 0));
              run.appendOutput(`Error: Failed to parse test output for ${test.id}\n`, location);
            }
          });
          continue;
        }

        // Find the file result
        const fileResult = parsedOutput.results.testResults.find(
          (result: BunFileResult) => result.name === filePath
        );

        if (fileResult) {
          this.log.info(`Processing test results for ${filePath}:`, fileResult);

          // In a simple case like math.test.ts, we can directly map tests to results if needed
          // Skip this implementation for now, and use the existing processTestResults
          if (tests && tests.length > 0 && tests[0] && tests[0].uri) {
            this.processTestResults(fileResult.tests, run, tests[0], '', 0, true);
          } else {
            this.log.error(`Cannot process test results: No valid test items found for ${filePath}`);
            tests.forEach(test => {
              if (test) {
                run.errored(test, new vscode.TestMessage("Invalid test item structure"));
              }
            });
          }
        } else {
          tests.forEach(test => {
            if (test) {
              run.skipped(test);
              // Add output for individual test
              if (test.uri) {
                const location = new vscode.Location(test.uri, new vscode.Position(0, 0));
                run.appendOutput(`\r\nNo test results found for ${test.id}\n`, location);
              }
            }
          });
        }
      } catch (error) {
        this.log.error(`Error running tests for ${filePath}: ${error}`);
        tests.forEach(test => {
          run.errored(test, new vscode.TestMessage(`Error: ${error}`));
          // Add output for individual test
          if (test.uri) {
            const location = new vscode.Location(test.uri, new vscode.Position(0, 0));
            run.appendOutput(`Error running test: ${error}\n`, location);
          }
        });
      }
    }

    run.end();
  }

  private markTestsAsRunning(test: vscode.TestItem, run: vscode.TestRun): void {
    if (!test) return;

    run.started(test);

    if (test.children) {
      test.children.forEach((child: vscode.TestItem) => {
        if (child) {
          this.markTestsAsRunning(child, run);
        }
      });
    }
  }

  private getTestNamePatterns(tests: vscode.TestItem[]): string[] {
    const patterns: string[] = [];

    const extractTestName = (test: vscode.TestItem): string | undefined => {
      if (!test.id.includes('#')) return undefined;

      // Extract the test label (not the path) - this is what Bun uses for matching
      return test.label;
    };

    const collectPatterns = (test: vscode.TestItem) => {
      const testName = extractTestName(test);
      if (testName) {
        patterns.push(testName);
      }

      // Always process children to collect all test names
      test.children.forEach(collectPatterns);
    };

    tests.forEach(collectPatterns);
    this.log.info(`Collected test patterns: ${patterns.join(', ')}`);
    return patterns;
  }

  private processTestResults(
    tests: BunTestResult[],
    run: vscode.TestRun,
    parent: vscode.TestItem,
    parentPath: string = '',
    indentLevel: number = 0,
    isLastBatch: boolean = true,
  ): void {
    if (!parent.uri) {
      this.log.error(`Cannot process test results: parent or parent.uri is null`);
      return;
    }

    this.log.info(`parent:`, parent);

    for (let i = 0; i < tests.length; i++) {
      const testResult = tests[i];
      const isLastTest = i === tests.length - 1;

      this.log.info(`testResult:`, testResult.name);

      // Find the matching test item in the test tree
      let testItem = parent;

      // If this is a child test, find the matching child test item
      if (testResult.name !== parent.label && parent.children.size > 0) {
        const foundChild = this.findMatchingTestItem(parent, testResult);
        if (foundChild) {
          testItem = foundChild;
          this.log.info(`Found matching child test item: ${testItem.label} (${testItem.id})`);
        } else if (!isRelatedTestResult(parent, testResult)) {
          this.log.warn(`unrelated test result: ${testResult.name}. testItem:`, parent);
          continue;
        }
      } else if (!isRelatedTestResult(parent, testResult)) {
        this.log.warn(`unrelated test result: ${testResult.name}. testItem:`, parent);
        continue;
      }

      this.log.info(`Using test item: ${testResult.name} (${testItem.id})`);

      // Create a location for the test output
      let location: vscode.Location | undefined;
      if (testItem.uri) {
        let line = 0;
        let column = 0;

        if (testResult.location) {
          // Ensure line is positive (VSCode uses 0-based lines)
          line = testResult.location.line > 0 ? testResult.location.line - 1 : 0;
          column = Math.max(0, testResult.location.column);
        }

        const position = new vscode.Position(line, column);
        location = new vscode.Location(testItem.uri, position);
      }

      // Check if this is a parent test (has children)
      const isParent = testResult.children && testResult.children.length > 0;
      const indent = ' '.repeat(indentLevel * 2);

      // Process test result with improved formatting
      if (testResult.status === 'passed') {
        run.passed(testItem, testResult.duration);
        if (location) {
          if (isParent) {
            // Green triangle for passed parent tests
            run.appendOutput(`\r\n${indent}\x1b[32m▼\x1b[0m ${testResult.name}`, location);
          } else {
            // Green checkmark for passed leaf tests
            run.appendOutput(`\r\n${indent}\x1b[32m✔\x1b[0m ${testResult.name}`, location);
          }
        }
      } else if (testResult.status === 'failed') {
        const message = new vscode.TestMessage(testResult.message || 'Test failed');

        if (testResult.location && testItem.uri) {
          // Ensure line is positive (VSCode uses 0-based lines)
          const line = testResult.location.line > 0 ? testResult.location.line - 1 : 0;
          const column = Math.max(0, testResult.location.column);

          message.location = new vscode.Location(
            testItem.uri,
            new vscode.Position(line, column)
          );
        }

        run.failed(testItem, message, testResult.duration);

        // Add detailed output for failed tests with appropriate icon
        if (location) {
          if (isParent) {
            // Red triangle for failed parent tests
            run.appendOutput(`\r\n${indent}\x1b[31m▼\x1b[0m ${testResult.name}`, location);
          } else {
            // Red X for failed leaf tests
            run.appendOutput(`\r\n${indent}\x1b[31m✗\x1b[0m ${testResult.name}`, location);
          }
          if (testResult.message) {
            // Improved error message formatting
            const errorMessage = testResult.message.trim();
            const messageLines = errorMessage.split('\n');

            // Add a separator line for errors
            run.appendOutput(`\r\n${indent}  \x1b[31m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\x1b[0m`, location);

            // Add file location info if available
            if (testResult.location) {
              const relativePath = testItem.uri ? testItem.uri.fsPath.replace(this.workspaceFolder.uri.fsPath + '/', '') : '';
              const locationInfo = `${relativePath}:${testResult.location.line}:${testResult.location.column}`;
              run.appendOutput(`\r\n${indent}  \x1b[2m${locationInfo}\x1b[0m`, location);
              run.appendOutput(`\r\n`, location);
            }

            // Format each line of the error message with proper indentation
            for (const line of messageLines) {
              if (line.includes('Expected:')) {
                const value = line.split('Expected:')[1].trim();
                run.appendOutput(`\r\n${indent}  \x1b[31mExpected:\x1b[0m \x1b[32m${value}\x1b[0m`, location);
              } else if (line.includes('Received:')) {
                const value = line.split('Received:')[1].trim();
                run.appendOutput(`\r\n${indent}  \x1b[31mReceived:\x1b[0m \x1b[33m${value}\x1b[0m`, location);
              } else if (line.includes('Error:')) {
                run.appendOutput(`\r\n${indent}  \x1b[31m${line.replace('Error:', 'Error:')}\x1b[0m`, location);
              } else if (line.includes('error:')) {
                run.appendOutput(`\r\n${indent}  \x1b[31m${line.replace('error:', 'Error:')}\x1b[0m`, location);
              } else if (line.includes('at <anonymous>')) {
                // Replace full path with relative path in stack traces
                const workspacePath = this.workspaceFolder.uri.fsPath;
                const relativeLine = line.replace(workspacePath + '/', '');
                run.appendOutput(`\r\n${indent}  ${relativeLine}`, location);
              } else {
                run.appendOutput(`\r\n${indent}  ${line}`, location);
              }
            }

            // Add a closing separator line
            run.appendOutput(`\r\n${indent}  \x1b[31m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\x1b[0m`, location);
          }
        }
      } else if (testResult.status === 'skipped') {
        run.skipped(testItem);
        if (location) {
          if (isParent) {
            // Yellow triangle for skipped parent tests
            run.appendOutput(`\r\n${indent}\x1b[33m▼\x1b[0m ${testResult.name}`, location);
          } else {
            // Yellow circle for skipped leaf tests
            run.appendOutput(`\r\n${indent}\x1b[33m○\x1b[0m ${testResult.name}`, location);
          }
        }
      }

      // Process children if there are any
      if (isParent && testItem) {
        this.processTestResults(testResult.children!, run, testItem, '', indentLevel + 1, false);
      }

      // Add a newline after the last test in the batch
      if (isLastTest && isLastBatch && indentLevel === 0 && location) {
        run.appendOutput(`\r\n`, location);
      }
    }
  }

  private async debugTests(
    tests: vscode.TestItem[],
    request: vscode.TestRunRequest,
    run: vscode.TestRun
  ): Promise<void> {
    // Get test files
    const testFiles = new Set<string>();

    // A better check for file-level test items (same as in runHandler)
    const testUriString = tests[0].uri?.toString();
    const testIdEndsWithFileName = tests[0].uri && tests[0].label === tests[0].uri.fsPath.split('/').pop();

    const isFileOnly = tests.length === 1 &&
      tests[0].uri &&
      (testIdEndsWithFileName ||
        !tests[0].id.includes('#') ||
        tests[0].id === testUriString);

    for (const test of tests) {
      if (test.uri) {
        testFiles.add(test.uri.fsPath);
      }
    }

    if (testFiles.size === 0) {
      run.end();
      return;
    }

    const bunPath = this.options.pathToBun();
    const args = ['test', '--inspect-brk'];

    // Add file patterns
    if (testFiles.size === 1) {
      args.push(Array.from(testFiles)[0]);
    } else {
      args.push('--pattern', Array.from(testFiles).join('|'));
    }

    // Add test name pattern if specific tests are requested
    if (!isFileOnly) {
      const testNamePatterns = this.getTestNamePatterns(tests);
      const testNames = testNamePatterns.map(pattern => pattern.split(' > ')?.pop() || pattern);
      if (testNamePatterns.length > 0) {
        const testNamesRegex = testNames.map(pattern => `(${pattern})`).join('|');
        args.push('--test-name-pattern', testNamesRegex);
      }
    }

    // Start debugging
    const debugConfiguration: vscode.DebugConfiguration = {
      args,
      console: "integratedTerminal",
      cwd: "${workspaceFolder}",
      internalConsoleOptions: "neverOpen",
      name: "Bun Test Debug",
      program: bunPath,
      request: "launch",
      type: "node",
    };

    try {
      await vscode.debug.startDebugging(this.workspaceFolder, debugConfiguration);
    } catch (error) {
      this.log.error("Error starting debugger:", error);
      tests.forEach(test => {
        run.errored(test, new vscode.TestMessage(`Error starting debugger: ${error}`));
      });
    }
  }

  private async runBunProcess(args: string[]): Promise<string | null> {
    const bunPath = this.options.pathToBun();
    const configPath = this.options.pathToConfig();

    if (configPath) {
      args.push('--config', configPath);
    }

    const fullCommand = `${bunPath} ${args.join(' ')}`;
    this.log.info(`Running bun process: ${fullCommand}`);

    return await this.spawnBunProcess(bunPath, args);
  }

  private async spawnBunProcess(command: string, args: string[]): Promise<string | null> {
    const result: string | null = await new Promise((resolve, reject) => {
      const useShell = platform() === "win32";
      const process = spawn(command, args, {
        cwd: this.workspaceFolder.uri.fsPath,
        shell: useShell,
      });

      const processInfo = {
        process,
        kill: () => process.kill()
      };

      this.activeProcesses.add(processInfo);

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        this.log.info(`[Bun stdout] ${chunk.trimEnd()}`);
      });

      process.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        this.log.warn(`[Bun stderr] ${chunk.trimEnd()}`);
      });

      process.on('close', (code) => {
        this.activeProcesses.delete(processInfo);
        this.log.info(`Bun process exited with code ${code}`);

        if (code === 0 || code === 1) {
          // Code 1 can be test failures but still valid output
          const output = stdout + stderr; // Include stderr because some important test output goes there
          this.log.info(`Bun output length: ${output.length} chars`);
          resolve(output);
        } else {
          this.log.error(`Bun process exited with error code ${code}`);
          this.log.error(`STDERR: ${stderr}`);
          reject(new Error(`Bun process exited with code ${code}: ${stderr}`));
        }
      });

      process.on('error', (err) => {
        this.activeProcesses.delete(processInfo);
        this.log.error(`Bun process error: ${err.message}`);
        reject(err);
      });
    });

    return result;
  }

  private closeAllActiveProcesses(): void {
    [...this.activeProcesses].forEach(p => {
      p.kill();
    });
    this.activeProcesses.clear();
  }

  public dispose(): void {
    this.closeAllActiveProcesses();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }

  // Helper method to find the exact matching test item for a test result
  private findMatchingTestItem(parent: vscode.TestItem, testResult: BunTestResult): vscode.TestItem | undefined {
    let foundItem: vscode.TestItem | undefined;

    // First try direct matching by label
    parent.children.forEach(child => {
      if (child.label === testResult.name) {
        foundItem = child;
      }
    });

    // If not found, try recursive search through children
    if (!foundItem) {
      parent.children.forEach(child => {
        if (!foundItem && child.children.size > 0) {
          const found = this.findMatchingTestItem(child, testResult);
          if (found) {
            foundItem = found;
          }
        }
      });
    }

    return foundItem;
  }
}

