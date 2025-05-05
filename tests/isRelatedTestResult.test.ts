import type { TestItem } from 'vscode';
import { BunTestResult } from '../src/types';
import { isRelatedTestResult } from '../src/utils/isRelatedTestResult';

test("isRelatedTestResult returns true when child name matches", () => {
  const testItem = {
    "id": "/Users/wzulfikar/code/playground/vscode-bun-test-explorer/tests/dummy.test.ts#User Authentication > Registration > should prevent duplicate emails",
    "uri": {
      "$mid": 1,
      "fsPath": "/Users/wzulfikar/code/playground/vscode-bun-test-explorer/tests/dummy.test.ts",
      "external": "file:///Users/wzulfikar/code/playground/vscode-bun-test-explorer/tests/dummy.test.ts",
      "path": "/Users/wzulfikar/code/playground/vscode-bun-test-explorer/tests/dummy.test.ts",
      "scheme": "file"
    },
    "children": [],
    "range": [
      {
        "line": 46,
        "character": 0
      },
      {
        "line": 46,
        "character": 31
      }
    ],
    "label": "should prevent duplicate emails",
    "description": "User Authentication > Registration > should prevent duplicate emails",
    "canResolveChildren": false,
    "busy": false,
    "tags": []
  } as unknown as TestItem

  // Test result that has "should prevent duplicate emails" as a child in the hierarchy
  const testResult = {
    "name": "User Authentication",
    "status": "passed",
    "children": [
      {
        "name": "Login Process",
        "status": "passed",
        "children": [
          {
            "name": "should validate username",
            "status": "skipped",
            "location": {
              "file": "/Users/wzulfikar/code/playground/vscode-bun-test-explorer/tests/dummy.test.ts",
              "line": 10,
              "column": 0
            },
            "parent": "User Authentication > Login Process"
          }
        ],
        "parent": "User Authentication",
        "location": {
          "file": "/Users/wzulfikar/code/playground/vscode-bun-test-explorer/tests/dummy.test.ts",
          "line": 9,
          "column": 0
        }
      },
      {
        "name": "Registration",
        "status": "passed",
        "children": [
          {
            "name": "should prevent duplicate emails",
            "status": "passed",
            "duration": 0.15,
            "location": {
              "file": "/Users/wzulfikar/code/playground/vscode-bun-test-explorer/tests/dummy.test.ts",
              "line": 47,
              "column": 0
            },
            "parent": "User Authentication > Registration"
          }
        ],
        "parent": "User Authentication",
        "location": {
          "file": "/Users/wzulfikar/code/playground/vscode-bun-test-explorer/tests/dummy.test.ts",
          "line": 27,
          "column": 0
        }
      }
    ],
    "location": {
      "file": "/Users/wzulfikar/code/playground/vscode-bun-test-explorer/tests/dummy.test.ts",
      "line": 4,
      "column": 0
    }
  } as BunTestResult

  expect(isRelatedTestResult(testItem, testResult)).toEqual(true);
})

test("isRelatedTestResult returns false when no match", () => {
  const testItem = {
    "label": "should prevent duplicate emails",
    "children": []
  } as unknown as TestItem

  const testResult = {
    "name": "Payment Processing",
    "status": "passed",
    "children": [
      {
        "name": "should format currency correctly",
        "status": "skipped"
      }
    ]
  } as BunTestResult

  expect(isRelatedTestResult(testItem, testResult)).toEqual(false);
})
