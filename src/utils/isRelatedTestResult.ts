import type { TestItem } from 'vscode'
import type { BunTestResult } from "../types";

export function isRelatedTestResult(testItem: TestItem, testResult: BunTestResult): boolean {
  // Check if the current node has the target name
  if (testResult.name === testItem.label) {
    return true;
  }

  // If this node has children, recursively search them
  if (testResult.children && testResult.children.length > 0) {
    for (const child of testResult.children) {
      if (isRelatedTestResult(testItem, child)) {
        return true;
      }
    }
  }
  return false;
}
