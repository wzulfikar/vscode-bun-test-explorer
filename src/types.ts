export interface BunTestResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  message?: string;
  location?: {
    file: string;
    line: number;
    column: number;
  };
  duration?: number;
  children?: BunTestResult[];
  parent?: string;
}

export interface BunFileResult {
  name: string;
  tests: BunTestResult[];
  passed: boolean;
  duration?: number;
}

export interface BunTestResponse {
  results: {
    testResults: BunFileResult[];
    numPassedTests: number;
    numFailedTests: number;
    numSkippedTests: number;
    numTotalTests: number;
  };
}

export type JUnitJson = {
  testsuites: {
    name: string;
    tests: string;
    assertions: string;
    failures: string;
    skipped: string;
    time: string;
    children: TestSuite[];
  }
}

type TestSuite = {
  testsuite: {
    name: string;
    tests: string;
    assertions: string;
    failures: string;
    skipped: string;
    time: string;
    hostname: string;
    children: TestCase[];
  }
}

type TestCase = {
  testcase: {
    name: string;
    classname: string;
    time: string;
    file: string;
    assertions: string;
    children?: (SkippedTest | FailureTest)[];
  }
}

type SkippedTest = {
  skipped: Record<string, never>;
}

type FailureTest = {
  failure: {
    type?: string;
  }
}
