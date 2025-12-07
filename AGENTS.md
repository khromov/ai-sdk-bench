## Project Overview

AI SDK benchmarking tool built with Vercel AI SDK and Bun runtime. Tests AI agents with MCP (Model Context Protocol) server integration, specifically using the Svelte MCP server for agent benchmarks. Automatically discovers and runs all tests in the `tests/` directory and verifies generated components against test suites.

## Development Commands

```bash
# Install dependencies (runs patch-package automatically)
bun install

# Run the main benchmark (discovers and runs all tests)
bun run index.ts

# Verify reference implementations against test suites
bun run verify-tests

# Generate HTML report from most recent result
bun run generate-report.ts

# Generate HTML report from specific result file
bun run generate-report.ts results/result-2024-12-07-14-30-45.json

# Run TypeScript type checking
bun tsc --noEmit
```

## Environment Variables

### MODEL Configuration

The `MODEL` environment variable determines which AI provider to use:

**Anthropic Direct API:**
```bash
MODEL=anthropic/claude-haiku-4-5
MODEL=anthropic/claude-sonnet-4
```

**OpenAI Direct API:**
```bash
MODEL=openai/gpt-5
MODEL=openai/gpt-5-mini
MODEL=openai/gpt-4o
```

**OpenRouter (300+ models):**
```bash
MODEL=openrouter/anthropic/claude-sonnet-4
MODEL=openrouter/google/gemini-pro
MODEL=openrouter/meta-llama/llama-3.1-405b-instruct
```

### MCP Server Configuration

The `MCP_SERVER_URL` environment variable controls MCP (Model Context Protocol) integration:

```bash
# Enable MCP with Svelte server (default for this benchmark)
MCP_SERVER_URL=https://mcp.svelte.dev/mcp

# Disable MCP integration (run without external tools)
MCP_SERVER_URL=

# Use a different MCP server
MCP_SERVER_URL=https://your-mcp-server.com/mcp
```

**Behavior:**
- If `MCP_SERVER_URL` is set and not empty: MCP tools are injected into the agent
- If `MCP_SERVER_URL` is empty or not set: Agent runs without MCP tools (only built-in tools)
- MCP status is documented in the result JSON and HTML report with a badge

### Required API Keys

- `ANTHROPIC_API_KEY`: Required when using `anthropic/*` models
- `OPENAI_API_KEY`: Required when using `openai/*` models (get at https://platform.openai.com/api-keys)
- `OPENROUTER_API_KEY`: Required when using `openrouter/*` models (get at https://openrouter.ai/keys)

### Provider Routing

The benchmark tool automatically routes to the correct provider based on the `MODEL` prefix:
- `anthropic/*` → Direct Anthropic API
- `openai/*` → Direct OpenAI API
- `openrouter/*` → OpenRouter unified API

This allows switching models and providers without any code changes.

## Architecture

### Core Components

- **`index.ts`**: Main benchmark entry point (Multi-Test Runner)

  - Discovers all tests in `tests/` directory automatically
  - Creates an AI agent using `Experimental_Agent` from Vercel AI SDK
  - Uses smart provider routing based on `MODEL` environment variable
  - Conditionally configures MCP client based on `MCP_SERVER_URL` environment variable
  - For each discovered test:
    - Loads the test prompt from `prompt.md`
    - Runs the agent with the prompt
    - Extracts the generated component from `ResultWrite` tool call
    - Verifies the component against the test suite
    - Collects results including pass/fail status
  - Generates timestamped result files in `results/` directory
  - Automatically opens HTML report in browser
  - Returns exit code 0 if all tests pass, 1 if any fail

- **`lib/test-discovery.ts`**: Test discovery and prompt loading

  - Scans `tests/` directory for test suites
  - Validates required files exist (Reference.svelte, test.ts, prompt.md)
  - Loads prompt content for each test
  - Provides structured `TestDefinition` objects
  - Builds agent prompts with instructions to use `ResultWrite` tool

- **`lib/output-test-runner.ts`**: Test verification system

  - Manages the `outputs/` directory for temporary test files
  - Writes LLM-generated components to `outputs/{test-name}/Component.svelte`
  - Copies test files and runs vitest against generated components
  - Parses test results and collects failure details
  - Cleans up test artifacts after each run
  - Returns detailed `TestVerificationResult` with pass/fail status

- **`lib/providers.ts`**: Smart provider routing

  - Loads environment configuration from `MODEL`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and `OPENROUTER_API_KEY`
  - Routes to appropriate provider based on model prefix:
    - `anthropic/*` → Direct Anthropic API
    - `openai/*` → Direct OpenAI API
    - `openrouter/*` → OpenRouter unified API
  - Validates required API keys and provides clear error messages
  - Returns configured language model instance

- **`lib/report.ts`**: HTML report generation (Multi-Test Support)

  - Supports new multi-test result format with expandable sections
  - Parses result JSON files containing multiple test runs
  - Renders detailed HTML visualization with:
    - Summary bar showing passed/failed/skipped counts
    - Expandable sections for each test
    - Test prompts (collapsible)
    - Agent steps with tool calls and responses
    - Generated component code
    - Test verification results with pass/fail details
    - Failed test names and error messages
    - Token usage statistics per step
    - Timestamps and metadata
    - MCP status badge (enabled/disabled with server URL)
  - Backward compatible with legacy single-test format
  - Auto-opens report in default browser

- **`generate-report.ts`**: Standalone report generator
  - Regenerates HTML reports from existing result JSON files
  - Can specify a specific result file or automatically uses the most recent one
  - Usage: `bun run generate-report.ts [path/to/result.json]`

- **`lib/verify-references.ts`**: Reference implementation verification
  - Discovers test suites in `tests/*/` directories
  - For each test suite:
    - Copies `Reference.svelte` → `Component.svelte`
    - Runs vitest tests via CLI with JSON reporter
    - Parses test results and collects failure details
    - Cleans up `Component.svelte` after testing
  - Provides detailed failure information including test names and error messages
  - Generates summary report with pass/fail statistics
  - Returns exit code 0 if all tests pass, 1 if any fail

- **`verify-references.ts`**: Test verification entry point
  - Entry point for verifying reference Svelte implementations
  - Usage: `bun run verify-tests`

### Test Suite Structure

Test suites are organized in the `tests/` directory with the following structure:

```
tests/
  {test-name}/
    Reference.svelte  - Reference implementation of the component
    test.ts          - Vitest test file (imports "./Component.svelte")
    prompt.md        - Prompt for AI agents to implement the component
```

**Benchmark Workflow:**
1. `index.ts` discovers all test suites in `tests/`
2. For each test:
   - Loads `prompt.md` and builds agent prompt
   - Agent generates component code based on the prompt
   - Agent calls `ResultWrite` tool with the component code
   - Component is written to `outputs/{test-name}/Component.svelte`
   - Test file is copied to `outputs/{test-name}/test.ts`
   - Vitest runs tests against the generated component
   - Results are collected (pass/fail, error messages)
   - Output directory is cleaned up
3. All results are saved to a timestamped JSON file
4. HTML report is generated with expandable sections for each test

**Reference Verification:**
- Run `bun run verify-tests` to validate reference implementations
- Each test file imports `Component.svelte` (not Reference.svelte directly)
- Verification system temporarily copies Reference.svelte → Component.svelte
- Tests use `@testing-library/svelte` for component testing
- Tests use `data-testid` attributes for element selection

### Directory Structure

```
.
├── index.ts                    # Main multi-test benchmark entry point
├── generate-report.ts          # Standalone report generator
├── verify-references.ts        # Reference verification entry point
├── lib/
│   ├── providers.ts            # Smart provider routing
│   ├── report.ts               # HTML report generation (multi-test)
│   ├── test-discovery.ts       # Test discovery and prompt loading
│   ├── output-test-runner.ts   # Test verification runner
│   └── verify-references.ts    # Reference implementation verification
├── tests/
│   ├── counter/                # Counter component test
│   │   ├── Reference.svelte
│   │   ├── test.ts
│   │   └── prompt.md
│   ├── derived-by/             # $derived.by test
│   │   ├── Reference.svelte
│   │   ├── test.ts
│   │   └── prompt.md
│   └── snippets/               # Snippets test
│       ├── Reference.svelte
│       ├── test.ts
│       └── prompt.md
├── outputs/                    # Temporary test outputs (gitignored)
├── results/                    # Benchmark results (JSON and HTML)
└── patches/                    # MCP client patches
```

### Key Technologies

- **Vercel AI SDK v5**: Agent framework with tool calling
- **@ai-sdk/anthropic**: Anthropic provider for direct API access
- **@ai-sdk/openai**: OpenAI provider for direct API access
- **@openrouter/ai-sdk-provider**: OpenRouter provider for unified access to 300+ models
- **@ai-sdk/mcp**: MCP client integration (with custom patch)
- **Bun Runtime**: JavaScript runtime (not Node.js)
- **Vitest**: Test framework for component testing
- **@testing-library/svelte**: Testing utilities for Svelte components

### MCP Integration

The project uses `@ai-sdk/mcp` with a custom patch applied via `patch-package`:

- Patch location: `patches/@ai-sdk+mcp+0.0.11.patch`
- Fixes: Handles missing event types in HTTP SSE responses by treating undefined events as "message" events
- MCP server: Configurable via `MCP_SERVER_URL` environment variable
- Default server: Svelte documentation server (`https://mcp.svelte.dev/mcp`)
- Can be disabled by leaving `MCP_SERVER_URL` empty

### Data Flow

1. Test discovery scans `tests/` directory for valid test suites
2. For each test:
   a. Agent receives prompt with access to tools (built-in + optional MCP tools)
   b. Agent iterates through steps, calling tools as needed
   c. Agent stops when `ResultWrite` tool is called with component code
   d. Component is written to `outputs/{test-name}/Component.svelte`
   e. Vitest runs test file against the generated component
   f. Test results are collected (pass/fail, error details)
   g. Output directory is cleaned up
3. All results aggregated into multi-test result object
4. Results written to `results/result-YYYY-MM-DD-HH-MM-SS.json` with metadata
5. HTML report generated at `results/result-YYYY-MM-DD-HH-MM-SS.html`
6. Report automatically opens in default browser

### Output Files

All results are saved in the `results/` directory with timestamped filenames:

- **JSON files**: `result-2024-12-07-14-30-45.json` - Complete execution trace with all test results
- **HTML files**: `result-2024-12-07-14-30-45.html` - Interactive visualization with expandable test sections

**Multi-Test Result JSON Structure:**
```json
{
  "tests": [
    {
      "testName": "counter",
      "prompt": "# Counter Component Task...",
      "steps": [...],
      "resultWriteContent": "<script>...</script>...",
      "verification": {
        "testName": "counter",
        "passed": true,
        "numTests": 4,
        "numPassed": 4,
        "numFailed": 0,
        "duration": 150,
        "failedTests": []
      }
    },
    ...
  ],
  "metadata": {
    "mcpEnabled": true,
    "mcpServerUrl": "https://mcp.svelte.dev/mcp",
    "timestamp": "2024-12-07T14:30:45.123Z",
    "model": "anthropic/claude-sonnet-4"
  }
}
```

This naming convention allows you to:
- Run multiple benchmarks without overwriting previous results
- Easily identify when each benchmark was run
- Compare results across different runs
- Track whether MCP was enabled for each run
- See per-test verification status

## TypeScript Configuration

- **Runtime**: Bun (not Node.js)
- **Module System**: ESNext with `module: "Preserve"` and `moduleResolution: "bundler"`
- **Strict Mode**: Enabled with additional checks:
  - `noUncheckedIndexedAccess: true` - array/index access always includes undefined
  - `noImplicitOverride: true` - override keyword required
  - `noFallthroughCasesInSwitch: true`
- **Import Extensions**: `.ts` extensions allowed in imports
- **No Emit**: TypeScript compilation not required for Bun runtime

## Important Notes

- The MCP client import uses a direct path to the patched module: `./node_modules/@ai-sdk/mcp/dist/index.mjs`
- Agent stops execution when the `ResultWrite` tool is called (configured via `stopWhen` option)
- The `outputs/` directory is used temporarily for test verification and is cleaned up after each test
- HTML reports include expandable sections for each test with full step details
- Test verification results show pass/fail status and failed test details
- Token usage includes cached token counts when available
- All result files are saved with timestamps to preserve historical benchmarks
- MCP integration can be toggled via `MCP_SERVER_URL` environment variable without code changes
- MCP status is clearly indicated in both the JSON metadata and HTML report with a visual badge
- Exit code is 0 if all tests pass, 1 if any tests fail
