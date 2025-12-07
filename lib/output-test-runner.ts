import {
  mkdirSync,
  rmSync,
  existsSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import { join, basename, dirname } from "node:path";
import type { TestDefinition } from "./test-discovery.ts";

const OUTPUTS_DIR = join(process.cwd(), "outputs");

export interface FailedTest {
  fullName: string;
  errorMessage: string;
}

export interface TestVerificationResult {
  testName: string;
  passed: boolean;
  numTests: number;
  numPassed: number;
  numFailed: number;
  duration: number;
  error?: string;
  failedTests?: FailedTest[];
}

interface VitestJsonOutput {
  testResults: Array<{
    name: string;
    status: string;
    startTime: number;
    endTime: number;
    assertionResults?: Array<{
      ancestorTitles: string[];
      title: string;
      status: string;
      failureMessages?: string[];
    }>;
  }>;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
}

/**
 * Ensure the outputs directory exists and is clean
 */
export function setupOutputsDirectory(): void {
  if (existsSync(OUTPUTS_DIR)) {
    rmSync(OUTPUTS_DIR, { recursive: true, force: true });
  }
  mkdirSync(OUTPUTS_DIR, { recursive: true });
}

/**
 * Clean up the outputs directory
 */
export function cleanupOutputsDirectory(): void {
  if (existsSync(OUTPUTS_DIR)) {
    rmSync(OUTPUTS_DIR, { recursive: true, force: true });
  }
}

/**
 * Prepare the outputs directory for a specific test
 * - Creates a subdirectory for the test
 * - Copies the test.ts file
 * - Writes the LLM-generated component
 */
export function prepareTestEnvironment(
  test: TestDefinition,
  componentCode: string
): string {
  const testDir = join(OUTPUTS_DIR, test.name);

  // Create the test directory
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
  mkdirSync(testDir, { recursive: true });

  // Write the LLM-generated component as Component.svelte
  const componentPath = join(testDir, "Component.svelte");
  writeFileSync(componentPath, componentCode, "utf-8");

  // Copy the test file
  const testFilePath = join(testDir, "test.ts");
  copyFileSync(test.testFile, testFilePath);

  return testDir;
}

/**
 * Clean up a specific test's output directory
 */
export function cleanupTestEnvironment(testName: string): void {
  const testDir = join(OUTPUTS_DIR, testName);
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
}

/**
 * Run vitest on the generated component and return the results
 */
export async function runTestVerification(
  test: TestDefinition,
  componentCode: string
): Promise<TestVerificationResult> {
  try {
    // Prepare the test environment
    const testDir = prepareTestEnvironment(test, componentCode);
    const testFilePath = join(testDir, "test.ts");

    // Run vitest
    const proc = Bun.spawn(
      ["bun", "vitest", "run", testFilePath, "--reporter=json", "--no-coverage"],
      {
        stdout: "pipe",
        stderr: "pipe",
      }
    );

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    await proc.exited;

    // Parse JSON output from vitest
    let jsonOutput: VitestJsonOutput | null = null;

    // Vitest JSON reporter outputs JSON on stdout
    const lines = stdout.split("\n");
    for (const line of lines) {
      if (line.trim().startsWith("{")) {
        try {
          jsonOutput = JSON.parse(line);
          break;
        } catch {
          // Not valid JSON, continue
        }
      }
    }

    if (!jsonOutput) {
      return {
        testName: test.name,
        passed: false,
        numTests: 0,
        numPassed: 0,
        numFailed: 0,
        duration: 0,
        error: `Failed to parse vitest output. stderr: ${stderr}`,
      };
    }

    // Calculate duration from test results
    let duration = 0;
    if (jsonOutput.testResults.length > 0) {
      const firstResult = jsonOutput.testResults[0];
      if (firstResult) {
        duration = firstResult.endTime - firstResult.startTime;
      }
    }

    // Collect failed test details
    const failedTests: FailedTest[] = [];
    for (const testResult of jsonOutput.testResults) {
      if (testResult.assertionResults) {
        for (const assertion of testResult.assertionResults) {
          if (assertion.status === "failed") {
            const fullName =
              assertion.ancestorTitles.length > 0
                ? `${assertion.ancestorTitles.join(" > ")} > ${assertion.title}`
                : assertion.title;

            const errorMessage =
              assertion.failureMessages?.join("\n") || "No error message available";

            failedTests.push({
              fullName,
              errorMessage,
            });
          }
        }
      }
    }

    return {
      testName: test.name,
      passed: jsonOutput.numFailedTests === 0,
      numTests: jsonOutput.numTotalTests,
      numPassed: jsonOutput.numPassedTests,
      numFailed: jsonOutput.numFailedTests,
      duration,
      failedTests: failedTests.length > 0 ? failedTests : undefined,
    };
  } catch (error) {
    return {
      testName: test.name,
      passed: false,
      numTests: 0,
      numPassed: 0,
      numFailed: 0,
      duration: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
