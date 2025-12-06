import {
  Experimental_Agent as Agent,
  hasToolCall,
  stepCountIs,
  tool,
} from "ai";
import { experimental_createMCPClient as createMCPClient } from "./node_modules/@ai-sdk/mcp/dist/index.mjs";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { writeFileSync } from "node:fs";
import { generateReport } from "./lib/report.ts";

const mcp_client = await createMCPClient({
  transport: {
    type: "http",
    url: "https://mcp.svelte.dev/mcp",
  },
});

const svelte_agent = new Agent({
  model: anthropic("claude-haiku-4-5"),

  stopWhen: hasToolCall("ResultWrite"),
  tools: {
    ResultWrite: tool({
      description: "Write content to a result file",
      inputSchema: z.object({
        content: z.string().describe("The content to write to the result file"),
      }),
      execute: async ({ content }) => {
        console.log("[ResultWrite called]", content);
        return { success: true };
      },
    }),
    ...(await mcp_client.tools()),
  },
});

const result = await svelte_agent.generate({
  prompt:
    "Can you build a counter component in svelte? Use the ResultWrite tool to write the result to a file when you are done.",
});

// Extract ResultWrite content from tool calls
let resultWriteContent: string | null = null;
for (const step of result.steps) {
  for (const content of step.content) {
    if (content.type === "tool-call" && content.toolName === "ResultWrite") {
      resultWriteContent = (content.input as { content: string }).content;
      break;
    }
  }
  if (resultWriteContent) break;
}

writeFileSync(
  "result.json",
  JSON.stringify({ ...result, resultWriteContent }, null, 2)
);

// Generate HTML report
await generateReport("result.json", "results/result.html");
