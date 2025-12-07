import { readFile, writeFile } from "node:fs/promises";
import type { TestVerificationResult } from "./output-test-runner.ts";

// Type definitions for result.json structure
interface TextBlock {
  type: "text";
  text: string;
}

interface ToolCallBlock {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  dynamic?: boolean;
}

interface ToolResultBlock {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  output: {
    content: Array<{ type: string; text?: string; [key: string]: unknown }>;
    isError?: boolean;
  };
  dynamic?: boolean;
}

type ContentBlock = TextBlock | ToolCallBlock | ToolResultBlock;

interface Message {
  role: "user" | "assistant";
  content: ContentBlock[];
}

interface Usage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens: number;
}

interface RequestBody {
  model: string;
  max_tokens: number;
  messages: Message[];
}

interface ResponseBody {
  id: string;
  timestamp: string;
  modelId: string;
  [key: string]: unknown;
}

interface Step {
  content: ContentBlock[];
  finishReason: string;
  usage: Usage;
  request: {
    body: RequestBody;
  };
  response: ResponseBody;
  [key: string]: unknown;
}

interface Metadata {
  mcpEnabled: boolean;
  mcpServerUrl: string | null;
  timestamp: string;
  model: string;
}

// Single test result within a multi-test run
export interface SingleTestResult {
  testName: string;
  prompt: string;
  steps: Step[];
  resultWriteContent: string | null;
  verification: TestVerificationResult | null;
}

// Multi-test result data structure
export interface MultiTestResultData {
  tests: SingleTestResult[];
  metadata: Metadata;
}

// Legacy single-test result data structure (for backward compatibility)
interface LegacyResultData {
  steps: Step[];
  resultWriteContent?: string | null;
  metadata?: Metadata;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  let result = "";
  for (const char of text) {
    result += map[char] ?? char;
  }
  return result;
}

/**
 * Format timestamp to readable date
 */
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Render a single content block based on its type
 */
function renderContentBlock(block: ContentBlock): string {
  if (block.type === "text") {
    return `<div class="text">${escapeHtml(block.text)}</div>`;
  } else if (block.type === "tool-call") {
    const inputJson = JSON.stringify(block.input, null, 2);
    return `<details class="tool">
  <summary><span class="arrow">→</span> <span class="tool-name">${escapeHtml(block.toolName)}</span></summary>
  <pre class="input">${escapeHtml(inputJson)}</pre>
</details>`;
  } else if (block.type === "tool-result") {
    const outputText = block.output?.content
      ? block.output.content
          .map((c) => c.text || JSON.stringify(c))
          .join("\n")
      : "No output";
    const isError = block.output?.isError || false;
    const statusIcon = isError ? "✗" : "✓";
    return `<details class="result ${isError ? "error" : ""}">
  <summary><span class="status ${isError ? "error" : "success"}">${statusIcon}</span> Output</summary>
  <pre class="output">${escapeHtml(outputText)}</pre>
</details>`;
  }
  return "";
}

/**
 * Render verification result section
 */
function renderVerificationResult(verification: TestVerificationResult | null): string {
  if (!verification) {
    return `<div class="verification-result skipped">
      <span class="verification-icon">⊘</span>
      <span class="verification-text">Test verification not run</span>
    </div>`;
  }

  const statusClass = verification.passed ? "passed" : "failed";
  const statusIcon = verification.passed ? "✓" : "✗";
  const statusText = verification.passed ? "All tests passed" : "Tests failed";

  let failedTestsHtml = "";
  if (verification.failedTests && verification.failedTests.length > 0) {
    const failedItems = verification.failedTests
      .map(
        (ft) => `<li class="failed-test">
          <div class="failed-test-name">${escapeHtml(ft.fullName)}</div>
          <pre class="failed-test-error">${escapeHtml(ft.errorMessage)}</pre>
        </li>`
      )
      .join("");
    failedTestsHtml = `<details class="failed-tests-details">
      <summary>Failed Tests (${verification.failedTests.length})</summary>
      <ul class="failed-tests-list">${failedItems}</ul>
    </details>`;
  }

  let errorHtml = "";
  if (verification.error) {
    errorHtml = `<div class="verification-error">Error: ${escapeHtml(verification.error)}</div>`;
  }

  return `<div class="verification-result ${statusClass}">
    <div class="verification-header">
      <span class="verification-icon">${statusIcon}</span>
      <span class="verification-text">${statusText}</span>
      <span class="verification-stats">${verification.numPassed}/${verification.numTests} tests (${verification.duration}ms)</span>
    </div>
    ${errorHtml}
    ${failedTestsHtml}
  </div>`;
}

/**
 * Render steps for a single test
 */
function renderSteps(steps: Step[]): string {
  return steps
    .map((step, index) => {
      const assistantContentHtml =
        step.content.map((block) => renderContentBlock(block)).join("") ||
        '<div class="text">No response</div>';

      const cachedInfo =
        step.usage.cachedInputTokens > 0
          ? `, ${step.usage.cachedInputTokens.toLocaleString()}⚡`
          : "";

      const inputTokens = step.usage.inputTokens;
      const cachedTokens = step.usage.cachedInputTokens;
      const uncachedInputTokens = inputTokens - cachedTokens;

      return `
    <details class="step">
      <summary class="step-header">
        <span class="step-num">Step ${index + 1}</span>
        <span class="line"></span>
        <span class="tokens" title="Total tokens: ${step.usage.totalTokens.toLocaleString()}&#10;Input: ${inputTokens.toLocaleString()} (${uncachedInputTokens.toLocaleString()} new + ${cachedTokens.toLocaleString()} cached)&#10;Output: ${step.usage.outputTokens.toLocaleString()}">${step.usage.totalTokens.toLocaleString()} tok</span>
        <span class="output" title="Output tokens generated: ${step.usage.outputTokens.toLocaleString()}&#10;${cachedTokens > 0 ? `Cached input tokens (⚡): ${cachedTokens.toLocaleString()} (not billed)` : 'No cached tokens'}">(${step.usage.outputTokens.toLocaleString()}↑${cachedInfo})</span>
        <span class="reason">${step.finishReason}</span>
      </summary>
      <div class="step-content">
        ${assistantContentHtml}
      </div>
    </details>`;
    })
    .join("\n");
}

/**
 * Render a single test's section
 */
function renderTestSection(test: SingleTestResult, index: number): string {
  const totalTokens = test.steps.reduce((sum, step) => sum + step.usage.totalTokens, 0);
  const stepCount = test.steps.length;
  const verificationStatus = test.verification
    ? test.verification.passed
      ? "passed"
      : "failed"
    : "skipped";
  const verificationIcon = test.verification
    ? test.verification.passed
      ? "✓"
      : "✗"
    : "⊘";

  const stepsHtml = renderSteps(test.steps);
  const verificationHtml = renderVerificationResult(test.verification);

  const resultWriteHtml = test.resultWriteContent
    ? `<div class="output-section">
        <h4>Generated Component</h4>
        <pre class="code">${escapeHtml(test.resultWriteContent)}</pre>
      </div>`
    : "";

  return `
  <details class="test-section ${verificationStatus}" open>
    <summary class="test-header">
      <span class="test-status ${verificationStatus}">${verificationIcon}</span>
      <span class="test-name">${escapeHtml(test.testName)}</span>
      <span class="test-meta">${stepCount} steps · ${totalTokens.toLocaleString()} tokens</span>
    </summary>
    <div class="test-content">
      <details class="prompt-section">
        <summary>Prompt</summary>
        <pre class="prompt-text">${escapeHtml(test.prompt)}</pre>
      </details>
      
      <div class="steps-section">
        <h4>Agent Steps</h4>
        ${stepsHtml}
      </div>
      
      ${resultWriteHtml}
      
      <div class="verification-section">
        <h4>Test Verification</h4>
        ${verificationHtml}
      </div>
    </div>
  </details>`;
}

/**
 * Generate HTML report from multi-test result data
 */
function generateMultiTestHtml(data: MultiTestResultData): string {
  const metadata = data.metadata;
  const totalTests = data.tests.length;
  const passedTests = data.tests.filter((t) => t.verification?.passed).length;
  const failedTests = data.tests.filter((t) => t.verification && !t.verification.passed).length;
  const skippedTests = data.tests.filter((t) => !t.verification).length;

  const totalTokens = data.tests.reduce(
    (sum, test) => sum + test.steps.reduce((s, step) => s + step.usage.totalTokens, 0),
    0
  );

  const mcpBadge = metadata.mcpEnabled
    ? `<span class="mcp-badge enabled">MCP: ${escapeHtml(metadata.mcpServerUrl || "")}</span>`
    : `<span class="mcp-badge disabled">MCP ✗</span>`;

  const mcpNotice = !metadata.mcpEnabled
    ? `
  <div class="mcp-notice">
    <span class="notice-icon">ℹ️</span>
    <span class="notice-text">MCP integration was not used in this benchmark. The agent ran with built-in tools only.</span>
  </div>`
    : "";

  const overallStatus =
    failedTests === 0 && skippedTests === 0
      ? "all-passed"
      : failedTests > 0
        ? "has-failures"
        : "has-skipped";

  const testsHtml = data.tests
    .map((test, index) => renderTestSection(test, index))
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SvelteBench 2.0 - Multi-Test Report</title>
  <style>
    :root {
      --bg: #f8f8f8;
      --surface: #ffffff;
      --text: #24292e;
      --text-muted: #6a737d;
      --border: #e1e4e8;
      --success: #238636;
      --error: #cf222e;
      --warning: #9a6700;
      --tool: #8250df;
      --mcp-enabled: #0969da;
      --mcp-disabled: #6a737d;
      --notice-bg: #ddf4ff;
      --notice-border: #54aeff;
      --passed-bg: #dafbe1;
      --passed-border: #238636;
      --failed-bg: #ffebe9;
      --failed-border: #cf222e;
      --skipped-bg: #fff8c5;
      --skipped-border: #9a6700;
    }

    [data-theme="dark"] {
      --bg: #0d1117;
      --surface: #161b22;
      --text: #e6edf3;
      --text-muted: #8b949e;
      --border: #30363d;
      --success: #3fb950;
      --error: #f85149;
      --warning: #d29922;
      --tool: #a371f7;
      --mcp-enabled: #58a6ff;
      --mcp-disabled: #8b949e;
      --notice-bg: #1c2d41;
      --notice-border: #388bfd;
      --passed-bg: #1a3d24;
      --passed-border: #3fb950;
      --failed-bg: #3d1a1a;
      --failed-border: #f85149;
      --skipped-bg: #3d3514;
      --skipped-border: #d29922;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    html {
      background: var(--bg);
      color: var(--text);
      font-family: 'JetBrains Mono', 'SF Mono', 'Monaco', 'Menlo', monospace;
      font-size: 13px;
      line-height: 1.4;
    }

    body {
      padding: 12px;
      max-width: 1200px;
      margin: 0 auto;
    }

    header {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 12px;
      margin-bottom: 12px;
    }

    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    h1 {
      font-size: 16px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .meta {
      font-size: 12px;
      color: var(--text-muted);
    }

    .summary-bar {
      display: flex;
      gap: 16px;
      padding-top: 8px;
      border-top: 1px solid var(--border);
      margin-top: 8px;
    }

    .summary-item {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
    }

    .summary-item.passed { color: var(--success); }
    .summary-item.failed { color: var(--error); }
    .summary-item.skipped { color: var(--warning); }

    .mcp-badge {
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 3px;
      font-weight: 500;
      white-space: nowrap;
    }

    .mcp-badge.enabled {
      background: var(--mcp-enabled);
      color: white;
    }

    .mcp-badge.disabled {
      background: var(--bg);
      border: 1px solid var(--border);
      color: var(--text-muted);
    }

    .mcp-notice {
      background: var(--notice-bg);
      border: 1px solid var(--notice-border);
      border-radius: 4px;
      padding: 10px 12px;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
    }

    .notice-icon {
      font-size: 16px;
      flex-shrink: 0;
    }

    .notice-text {
      color: var(--text);
      line-height: 1.5;
    }

    .theme-toggle {
      background: none;
      border: 1px solid var(--border);
      border-radius: 3px;
      color: var(--text);
      cursor: pointer;
      padding: 4px 8px;
      font-size: 16px;
    }

    .theme-toggle:hover {
      background: var(--border);
    }

    /* Test Section Styles */
    .test-section {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 4px;
      margin-bottom: 12px;
    }

    .test-section.passed {
      border-left: 3px solid var(--success);
    }

    .test-section.failed {
      border-left: 3px solid var(--error);
    }

    .test-section.skipped {
      border-left: 3px solid var(--warning);
    }

    .test-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px;
      cursor: pointer;
      user-select: none;
      list-style: none;
    }

    .test-header::-webkit-details-marker {
      display: none;
    }

    .test-header:hover {
      background: var(--bg);
    }

    .test-status {
      font-size: 16px;
      font-weight: bold;
    }

    .test-status.passed { color: var(--success); }
    .test-status.failed { color: var(--error); }
    .test-status.skipped { color: var(--warning); }

    .test-name {
      font-weight: 600;
      font-size: 14px;
    }

    .test-meta {
      margin-left: auto;
      color: var(--text-muted);
      font-size: 12px;
    }

    .test-content {
      padding: 12px;
      border-top: 1px solid var(--border);
    }

    .test-content h4 {
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--text-muted);
    }

    .prompt-section {
      margin-bottom: 16px;
    }

    .prompt-section summary {
      cursor: pointer;
      padding: 8px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 3px;
      font-weight: 600;
    }

    .prompt-text {
      padding: 12px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-top: none;
      border-radius: 0 0 3px 3px;
      white-space: pre-wrap;
      font-size: 12px;
      max-height: 300px;
      overflow-y: auto;
    }

    .steps-section {
      margin-bottom: 16px;
    }

    .output-section {
      margin-bottom: 16px;
    }

    .verification-section {
      margin-top: 16px;
    }

    /* Step Styles */
    .step {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 4px;
      margin-bottom: 8px;
    }

    .step-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      cursor: pointer;
      user-select: none;
      list-style: none;
    }

    .step-header::-webkit-details-marker {
      display: none;
    }

    .step-header:hover {
      background: var(--bg);
    }

    .step-num {
      font-weight: 600;
    }

    .line {
      flex: 1;
      height: 1px;
      background: var(--border);
    }

    .tokens {
      color: var(--text-muted);
      cursor: help;
      border-bottom: 1px dotted var(--text-muted);
    }

    .output {
      color: var(--text);
      cursor: help;
      border-bottom: 1px dotted var(--text-muted);
    }

    .reason {
      color: var(--text-muted);
      font-size: 12px;
    }

    .step-content {
      padding: 12px;
      border-top: 1px solid var(--border);
    }

    .text {
      white-space: pre-wrap;
      margin-bottom: 8px;
      padding-left: 8px;
      border-left: 2px solid var(--border);
    }

    .tool,
    .result {
      margin: 8px 0;
      border: 1px solid var(--border);
      border-radius: 3px;
    }

    .tool summary,
    .result summary {
      padding: 4px 8px;
      cursor: pointer;
      user-select: none;
      list-style: none;
    }

    .tool summary::-webkit-details-marker,
    .result summary::-webkit-details-marker {
      display: none;
    }

    .tool summary:hover,
    .result summary:hover {
      background: var(--bg);
    }

    .arrow {
      color: var(--tool);
    }

    .tool-name {
      font-weight: 600;
    }

    .status {
      font-weight: 600;
    }

    .status.success {
      color: var(--success);
    }

    .status.error {
      color: var(--error);
    }

    .result.error {
      border-color: var(--error);
    }

    .input,
    .output {
      padding: 8px;
      background: var(--bg);
      border-top: 1px solid var(--border);
      overflow-x: auto;
      font-size: 12px;
    }

    .code {
      padding: 8px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 3px;
      overflow-x: auto;
      font-size: 12px;
      white-space: pre-wrap;
      max-height: 400px;
      overflow-y: auto;
    }

    /* Verification Styles */
    .verification-result {
      padding: 12px;
      border-radius: 4px;
      border: 1px solid var(--border);
    }

    .verification-result.passed {
      background: var(--passed-bg);
      border-color: var(--passed-border);
    }

    .verification-result.failed {
      background: var(--failed-bg);
      border-color: var(--failed-border);
    }

    .verification-result.skipped {
      background: var(--skipped-bg);
      border-color: var(--skipped-border);
    }

    .verification-header {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .verification-icon {
      font-size: 18px;
      font-weight: bold;
    }

    .verification-result.passed .verification-icon { color: var(--success); }
    .verification-result.failed .verification-icon { color: var(--error); }
    .verification-result.skipped .verification-icon { color: var(--warning); }

    .verification-text {
      font-weight: 600;
    }

    .verification-stats {
      margin-left: auto;
      color: var(--text-muted);
      font-size: 12px;
    }

    .verification-error {
      margin-top: 8px;
      padding: 8px;
      background: var(--bg);
      border-radius: 3px;
      font-size: 12px;
      color: var(--error);
    }

    .failed-tests-details {
      margin-top: 12px;
    }

    .failed-tests-details summary {
      cursor: pointer;
      font-weight: 600;
      padding: 4px 0;
    }

    .failed-tests-list {
      list-style: none;
      margin-top: 8px;
    }

    .failed-test {
      margin-bottom: 12px;
      padding: 8px;
      background: var(--bg);
      border-radius: 3px;
    }

    .failed-test-name {
      font-weight: 600;
      margin-bottom: 4px;
      color: var(--error);
    }

    .failed-test-error {
      font-size: 11px;
      white-space: pre-wrap;
      max-height: 200px;
      overflow-y: auto;
      background: var(--surface);
      padding: 8px;
      border-radius: 3px;
    }

    @media (max-width: 768px) {
      body {
        padding: 8px;
      }
    }
  </style>
</head>
<body>
  <header>
    <div class="header-top">
      <div>
        <h1>SvelteBench 2.0 ${mcpBadge}</h1>
        <div class="meta">${escapeHtml(metadata.model)} · ${totalTests} tests · ${totalTokens.toLocaleString()} tokens · ${formatTimestamp(metadata.timestamp)}</div>
      </div>
      <button class="theme-toggle" onclick="toggleTheme()">◐</button>
    </div>
    <div class="summary-bar">
      <div class="summary-item passed">✓ ${passedTests} passed</div>
      <div class="summary-item failed">✗ ${failedTests} failed</div>
      ${skippedTests > 0 ? `<div class="summary-item skipped">⊘ ${skippedTests} skipped</div>` : ""}
    </div>
  </header>

  ${mcpNotice}
  
  ${testsHtml}

  <script>
    function toggleTheme() {
      const html = document.documentElement;
      const current = html.dataset.theme || 'light';
      const next = current === 'light' ? 'dark' : 'light';
      html.dataset.theme = next;
      localStorage.setItem('theme', next);
    }

    document.documentElement.dataset.theme = localStorage.getItem('theme') || 'light';
  </script>
</body>
</html>`;
}

/**
 * Generate HTML report from result.json file
 * Supports both legacy single-test and new multi-test formats
 * @param resultPath - Path to the result.json file
 * @param outputPath - Path where the HTML report will be saved
 */
export async function generateReport(
  resultPath: string,
  outputPath: string
): Promise<void> {
  try {
    // Read and parse the result.json file
    const jsonContent = await readFile(resultPath, "utf-8");
    const data = JSON.parse(jsonContent);

    let html: string;

    // Check if it's the new multi-test format
    if ("tests" in data && Array.isArray(data.tests)) {
      html = generateMultiTestHtml(data as MultiTestResultData);
    } else {
      // Legacy format - convert to multi-test format for consistent rendering
      const legacyData = data as LegacyResultData;
      const multiTestData: MultiTestResultData = {
        tests: [
          {
            testName: "Legacy Test",
            prompt: "Static prompt (legacy format)",
            steps: legacyData.steps,
            resultWriteContent: legacyData.resultWriteContent ?? null,
            verification: null,
          },
        ],
        metadata: legacyData.metadata ?? {
          mcpEnabled: false,
          mcpServerUrl: null,
          timestamp: new Date().toISOString(),
          model: "unknown",
        },
      };
      html = generateMultiTestHtml(multiTestData);
    }

    // Write the HTML file
    await writeFile(outputPath, html, "utf-8");

    console.log(`✓ Report generated successfully: ${outputPath}`);

    // Open the report in the default browser
    Bun.spawn(["open", outputPath]);
  } catch (error) {
    console.error("Error generating report:", error);
    throw error;
  }
}
