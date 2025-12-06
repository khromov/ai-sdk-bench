import { readFile, writeFile } from "node:fs/promises";

// Type definitions for result.json structure
interface ContentBlock {
  type: "text";
  text: string;
}

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

interface ResultData {
  steps: Step[];
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
 * Generate HTML report from result data
 */
function generateHtml(data: ResultData): string {
  const stepsHtml = data.steps
    .map((step, index) => {
      const userMessage = step.request.body.messages.find((m) => m.role === "user");
      const userPrompt = (userMessage?.content[0]?.text || "No prompt").trim();
      const assistantResponse = (step.content[0]?.text || "No response").trim();
      const timestamp = formatTimestamp(step.response.timestamp);

      return `
        <div class="step">
          <div class="step-header">
            <h2>Step ${index + 1}</h2>
            <span class="timestamp">${timestamp}</span>
          </div>

          <div class="metadata">
            <div class="meta-item">
              <span class="meta-label">Model:</span>
              <span class="meta-value">${step.response.modelId}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Finish Reason:</span>
              <span class="meta-value">${step.finishReason}</span>
            </div>
          </div>

          <div class="usage">
            <div class="usage-item">
              <span class="usage-label">Input Tokens:</span>
              <span class="usage-value">${step.usage.inputTokens.toLocaleString()}</span>
            </div>
            <div class="usage-item">
              <span class="usage-label">Output Tokens:</span>
              <span class="usage-value">${step.usage.outputTokens.toLocaleString()}</span>
            </div>
            <div class="usage-item">
              <span class="usage-label">Total Tokens:</span>
              <span class="usage-value">${step.usage.totalTokens.toLocaleString()}</span>
            </div>
            ${
              step.usage.cachedInputTokens > 0
                ? `<div class="usage-item">
                <span class="usage-label">Cached Tokens:</span>
                <span class="usage-value">${step.usage.cachedInputTokens.toLocaleString()}</span>
              </div>`
                : ""
            }
          </div>

          <div class="section">
            <h3>User Prompt</h3>
            <div class="content user-content">${escapeHtml(userPrompt)}</div>
          </div>

          <div class="section">
            <h3>Assistant Response</h3>
            <div class="content assistant-content">${escapeHtml(assistantResponse)}</div>
          </div>
        </div>
      `;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI SDK Benchmark Results</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.5;
      color: #333;
      background-color: #f5f5f5;
      padding: 1rem;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
    }

    h1 {
      text-align: center;
      margin-bottom: 1rem;
      color: #1a1a1a;
      font-size: 1.75rem;
    }

    .step {
      background: white;
      border-radius: 6px;
      padding: 1.25rem;
      margin-bottom: 1.25rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .step-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid #e0e0e0;
    }

    .step-header h2 {
      color: #2563eb;
      font-size: 1.25rem;
    }

    .timestamp {
      color: #666;
      font-size: 0.85rem;
    }

    .metadata {
      display: flex;
      gap: 1.5rem;
      margin-bottom: 0.75rem;
      flex-wrap: wrap;
      font-size: 0.9rem;
    }

    .meta-item {
      display: flex;
      gap: 0.4rem;
    }

    .meta-label {
      font-weight: 600;
      color: #666;
    }

    .meta-value {
      color: #333;
    }

    .usage {
      display: flex;
      gap: 1.5rem;
      padding: 0.75rem;
      background-color: #f8f9fa;
      border-radius: 4px;
      margin-bottom: 1rem;
      flex-wrap: wrap;
      font-size: 0.85rem;
    }

    .usage-item {
      display: flex;
      gap: 0.4rem;
    }

    .usage-label {
      font-weight: 600;
      color: #666;
    }

    .usage-value {
      color: #2563eb;
      font-weight: 600;
    }

    .section {
      margin-bottom: 1rem;
    }

    .section:last-child {
      margin-bottom: 0;
    }

    .section h3 {
      color: #1a1a1a;
      margin-bottom: 0.5rem;
      font-size: 1rem;
    }

    .content {
      padding: 0.75rem;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 0.9rem;
    }

    .user-content {
      background-color: #f0f9ff;
      border-left: 3px solid #2563eb;
      font-family: monospace;
      white-space: pre-wrap;
    }

    .assistant-content {
      background-color: #fafafa;
      border-left: 3px solid #16a34a;
      font-family: monospace;
      white-space: pre-wrap;
    }

    @media (max-width: 768px) {
      body {
        padding: 0.75rem;
      }

      .step {
        padding: 1rem;
      }

      .metadata,
      .usage {
        flex-direction: column;
        gap: 0.4rem;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>AI SDK Benchmark Results</h1>
    ${stepsHtml}
  </div>
</body>
</html>`;
}

/**
 * Generate HTML report from result.json file
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
    const data: ResultData = JSON.parse(jsonContent);

    // Generate HTML
    const html = generateHtml(data);

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
