import type { TestItem } from 'vscode'
import type { BunTestResult } from "../types";

export function isRelatedTestResult(testItem: TestItem, testResult: BunTestResult): boolean {
  // Check if the current node has the target name
  if (testResult.name === testItem.label) {
    return true;
  }

  // Check if testResult has a tests array (for file result objects)
  if ('tests' in testResult && Array.isArray(testResult.tests)) {
    for (const test of testResult.tests) {
      if (isRelatedTestResult(testItem, test)) {
        return true;
      }
    }
  }

  // If testResult has children, recursively search them
  if (testResult.children && testResult.children.length > 0) {
    for (const child of testResult.children) {
      if (isRelatedTestResult(testItem, child)) {
        return true;
      }
    }
  }

  // If testItem has children, check if any of them match the testResult
  if (testItem.children && testItem.children.size > 0) {
    let found = false;
    testItem.children.forEach(child => {
      if (!found && isRelatedTestResult(child, testResult)) {
        found = true;
      }
    });
    if (found) {
      return true;
    }
  }

  return false;
}
