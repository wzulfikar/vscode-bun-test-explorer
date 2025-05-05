import * as path from 'path';
import * as fs from 'fs';
import type { BunTestResponse, BunFileResult, BunTestResult } from "../types";

export function parseBunTestOutput(output: string, workspacePath: string): BunTestResponse {
  const lines = output.trim().split('\n');
  const testResults: BunFileResult[] = [];
  let currentFile: BunFileResult | null = null;
  let numPassedTests = 0;
  let numFailedTests = 0;
  let numSkippedTests = 0;
  let currentError: string = '';
  let collectingError = false;
  let errorLine = 0;
  let errorColumn = 0;
  let errorFile = '';
  
  // Map to store source code line info by file
  const fileLineMap = new Map<string, Map<string, number>>();

  // Regular expressions for parsing
  const fileLineRegex = /^([^:]+):$/;
  const testPassRegex = /^\(pass\)\s+(.*?)(?:\s+\[([0-9.]+)ms\])?$/;
  const testFailRegex = /^\(fail\)\s+(.*?)(?:\s+\[([0-9.]+)ms\])?$/;
  const testSkipRegex = /^\(skip\)\s+(.*?)(?:\s+\[([0-9.]+)ms\])?$/;
  const errorLocationRegex = /^\s+at\s+.*?\(([^:]+):(\d+):(\d+)\)$/;
  const errorPositionRegex = /\^/;
  
  // Additional regex for extracting error location from the stack trace line
  const anonymousErrorLocationRegex = /at <anonymous> \(([^:]+):(\d+):(\d+)\)/;
  
  // Additional regex for capturing code context lines with line numbers
  const codeLineRegex = /^(\d+) \|(.*)$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Skip the first line showing the bun version
    if (line.startsWith('bun test v')) continue;

    // Skip the summary lines
    if (line.match(/^\d+\s+pass$/)) continue;
    if (line.match(/^\d+\s+fail$/)) continue;
    if (line.match(/^\d+\s+skip$/)) continue;
    if (line.match(/^\d+\s+expect\(\) calls$/)) continue;
    if (line.match(/^Ran \d+ tests across \d+ files/)) continue;

    // Check if we're collecting error message details
    if (collectingError) {
      // Check for error location in stack trace format
      const anonymousMatch = line.match(anonymousErrorLocationRegex);
      if (anonymousMatch) {
        const [_, filePath, lineNum, colNum] = anonymousMatch;
        errorFile = filePath;
        errorLine = parseInt(lineNum, 10);
        errorColumn = parseInt(colNum, 10);
        
        // Add this to the error message
        currentError += line + '\n';
        continue;
      }
      
      // Check for code context lines
      const codeLineMatch = line.match(codeLineRegex);
      if (codeLineMatch) {
        currentError += line + '\n';
        continue;
      }
      
      if (line.match(/^\s+at\s+/)) {
        // Look for location information in the stack trace
        const locationMatch = line.match(errorLocationRegex);
        if (locationMatch) {
          const [_, filePath, lineNum, colNum] = locationMatch;
          errorFile = filePath;
          errorLine = parseInt(lineNum, 10);
          errorColumn = parseInt(colNum, 10);
          
          // Add this to the error message
          currentError += line + '\n';
        }
        continue;
      } else if (line.match(testPassRegex) || line.match(testFailRegex) || line.match(testSkipRegex) || line.match(fileLineRegex)) {
        // We've hit a new test or file, so we're done collecting the error
        collectingError = false;
      } else {
        // Keep collecting the error message
        currentError += line + '\n';
        continue;
      }
    }

    // Check if this is a file line
    const fileMatch = line.match(fileLineRegex);
    if (fileMatch) {
      // If we were processing a file, add it to the results
      if (currentFile && currentFile.tests.length > 0) {
        testResults.push(currentFile);
      }

      // Start a new file
      const filePath = fileMatch[1].trim();
      const fullPath = filePath.startsWith('/') ?
        filePath :
        path.resolve(workspacePath, filePath);

      currentFile = {
        name: fullPath,
        tests: [],
        passed: true
      };
      
      // Extract line numbers from the file for accurate test locations
      extractSourceFileLineNumbers(fullPath, fileLineMap);
      
      continue;
    }

    // If we don't have a current file, skip
    if (!currentFile) continue;

    // Look for an error position marker line
    if (line.match(errorPositionRegex)) {
      collectingError = true;
      currentError = '';

      // Check the previous lines for line/column info
      if (i >= 1) {
        const prevLine = lines[i - 1].trim();
        const matches = prevLine.match(/.*:(\d+):(\d+)$/);
        if (matches) {
          errorLine = parseInt(matches[1], 10);
          errorColumn = parseInt(matches[2], 10);
        }
      }

      continue;
    }

    // Check for code context lines
    const codeLineMatch = line.match(codeLineRegex);
    if (codeLineMatch) {
      // We're seeing code context lines, which likely precede an error
      continue;
    }

    // Check if this starts with error/Expected
    if (line.startsWith('error:') || line.startsWith('Expected:')) {
      collectingError = true;
      currentError += line + '\n';
      continue;
    }

    // Check if this is a failing test
    const failMatch = line.match(testFailRegex);
    if (failMatch) {
      const testPath = failMatch[1].trim();
      const duration = failMatch[2] ? parseFloat(failMatch[2]) : undefined;

      // Create a test result with path segments organized in a hierarchy
      addTestWithHierarchy(
        currentFile.tests, 
        testPath, 
        {
          name: getLastPathSegment(testPath),
          status: 'failed',
          message: currentError.trim(),
          duration,
          location: {
            file: errorFile || currentFile.name,
            line: errorLine,
            column: errorColumn
          }
        },
        fileLineMap.get(currentFile.name)
      );

      numFailedTests++;
      currentFile.passed = false;
      collectingError = false;
      currentError = '';
      errorLine = 0;
      errorColumn = 0;
      errorFile = '';
      continue;
    }

    // Check if this is a passing test
    const passMatch = line.match(testPassRegex);
    if (passMatch) {
      const testPath = passMatch[1].trim();
      const duration = passMatch[2] ? parseFloat(passMatch[2]) : undefined;

      // Create a test result with path segments organized in a hierarchy
      addTestWithHierarchy(
        currentFile.tests, 
        testPath, 
        {
          name: getLastPathSegment(testPath),
          status: 'passed',
          duration,
          location: {
            file: currentFile.name,
            line: 0,  // Will be replaced with actual line number if found
            column: 0
          }
        },
        fileLineMap.get(currentFile.name)
      );

      numPassedTests++;
      continue;
    }

    // Check if this is a skipped test
    const skipMatch = line.match(testSkipRegex);
    if (skipMatch) {
      const testPath = skipMatch[1].trim();
      const duration = skipMatch[2] ? parseFloat(skipMatch[2]) : undefined;

      // Create a test result with path segments organized in a hierarchy
      addTestWithHierarchy(
        currentFile.tests, 
        testPath, 
        {
          name: getLastPathSegment(testPath),
          status: 'skipped',
          duration,
          location: {
            file: currentFile.name,
            line: 0,  // Will be replaced with actual line number if found
            column: 0
          }
        },
        fileLineMap.get(currentFile.name)
      );

      numSkippedTests++;
      continue;
    }
  }

  // Add the last file if we have one
  if (currentFile && currentFile.tests.length > 0) {
    testResults.push(currentFile);
  }

  return {
    results: {
      testResults,
      numSkippedTests,
      numPassedTests,
      numFailedTests,
      numTotalTests: numPassedTests + numFailedTests + numSkippedTests
    }
  };
}

/**
 * Extract line numbers for tests from source files
 */
function extractSourceFileLineNumbers(filePath: string, fileLineMap: Map<string, Map<string, number>>): void {
  try {
    if (!fs.existsSync(filePath)) {
      return;
    }
    
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const fileLines = fileContent.split('\n');
    const lineMap = new Map<string, number>();
    
    // Regular expressions to match test definitions
    const describeRegex = /\bdescribe\s*\(\s*["'`]([^"'`]+)["'`]/;
    const testRegex = /\b(?:test|it)(?:\.(?:skip|failing|only))?\s*\(\s*["'`]([^"'`]+)["'`]/;
    
    // Process each line in the file
    for (let i = 0; i < fileLines.length; i++) {
      const line = fileLines[i];
      
      // Check for describe blocks
      const describeMatch = line.match(describeRegex);
      if (describeMatch) {
        lineMap.set(describeMatch[1], i + 1); // 1-indexed line numbers
        continue;
      }
      
      // Check for test definitions
      const testMatch = line.match(testRegex);
      if (testMatch) {
        lineMap.set(testMatch[1], i + 1); // 1-indexed line numbers
      }
    }
    
    fileLineMap.set(filePath, lineMap);
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error);
  }
}

// Helper function to add a test to the hierarchy based on its path segments
function addTestWithHierarchy(
  tests: BunTestResult[], 
  testPath: string, 
  testResult: BunTestResult, 
  lineMap?: Map<string, number>
): void {
  const segments = testPath.split(' > ');
  
  // If there's only one segment, add it directly to the tests array
  if (segments.length === 1) {
    // Try to find the line number in the line map
    if (lineMap && lineMap.has(segments[0]) && testResult.location) {
      testResult.location.line = lineMap.get(segments[0]) || 0;
    }
    tests.push(testResult);
    return;
  }
  
  // Process the hierarchical structure
  let currentLevel = tests;
  let currentPath = '';
  
  // Iterate through all segments except the last one (which is the actual test name)
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    currentPath = currentPath ? `${currentPath} > ${segment}` : segment;
    
    // Look for an existing test suite at this level with the same name
    let testSuite = currentLevel.find(t => t.name === segment);
    
    if (!testSuite) {
      // If not found, create a new suite
      testSuite = {
        name: segment,
        status: 'passed', // Will be updated if any child test fails
        children: [],
        parent: i > 0 ? segments.slice(0, i).join(' > ') : undefined,
        location: {
          file: testResult.location?.file || '',
          line: lineMap?.get(segment) || 0, // Try to get the line number from the map
          column: 0
        }
      };
      currentLevel.push(testSuite);
    }
    
    // Ensure children array exists
    if (!testSuite.children) {
      testSuite.children = [];
    }
    
    // Set parent info for the test result
    if (i === segments.length - 2) {
      testResult.parent = currentPath;
    }
    
    // Move to the next level in the hierarchy
    currentLevel = testSuite.children;
  }
  
  // Add the test to the current level
  // Try to find the line number for this test
  if (lineMap && lineMap.has(segments[segments.length - 1]) && testResult.location) {
    testResult.location.line = lineMap.get(segments[segments.length - 1]) || 0;
  }
  
  currentLevel.push(testResult);
  
  // Update the status of all parent suites if the test failed
  if (testResult.status === 'failed') {
    updateParentStatus(tests, segments.slice(0, -1));
  }
}

// Helper function to update the status of parent suites when a test fails
function updateParentStatus(tests: BunTestResult[], parentPath: string[]): void {
  if (parentPath.length === 0) return;
  
  let currentLevel = tests;
  
  for (let i = 0; i < parentPath.length; i++) {
    const segment = parentPath[i];
    const testSuite = currentLevel.find(t => t.name === segment);
    
    if (testSuite) {
      testSuite.status = 'failed';
      if (testSuite.children) {
        currentLevel = testSuite.children;
      } else {
        break;
      }
    } else {
      break;
    }
  }
}

// Helper function to get the last segment of a test path
function getLastPathSegment(testPath: string): string {
  const segments = testPath.split(' > ');
  return segments[segments.length - 1];
}
