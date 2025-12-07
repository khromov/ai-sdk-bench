# ai-sdk-bench

AI SDK benchmarking tool that tests AI agents with MCP (Model Context Protocol) integration.

## Installation

To install dependencies:

```bash
bun install
```

## Setup

To set up `.env`:

```bash
cp .env.example .env
```

Then configure your API keys and model in `.env`:

```bash
# Required: Choose your model
MODEL=anthropic/claude-sonnet-4
ANTHROPIC_API_KEY=your_key_here

# Optional: Enable MCP integration (leave empty to disable)
MCP_SERVER_URL=https://mcp.svelte.dev/mcp
```

### Environment Variables

**Required:**
- `MODEL`: The AI model to use (e.g., `anthropic/claude-sonnet-4`, `openai/gpt-5`, `openrouter/anthropic/claude-sonnet-4`)
- Corresponding API key (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `OPENROUTER_API_KEY`)

**Optional:**
- `MCP_SERVER_URL`: MCP server URL (leave empty to disable MCP integration)

## Usage

To run a benchmark:

```bash
bun run index.ts
```

Results are saved to the `results/` directory with timestamped filenames:
- `results/result-2024-12-07-14-30-45.json` - Full execution trace with metadata
- `results/result-2024-12-07-14-30-45.html` - Interactive HTML report

The HTML report includes:
- Step-by-step execution trace
- Token usage statistics
- MCP status badge (shows if MCP was enabled and which server was used)
- Dark/light theme toggle

To regenerate an HTML report from a JSON file:

```bash
# Regenerate most recent result
bun run generate-report.ts

# Regenerate specific result
bun run generate-report.ts results/result-2024-12-07-14-30-45.json
```

## MCP Integration

The tool supports optional integration with MCP (Model Context Protocol) servers:

- **Enabled**: Set `MCP_SERVER_URL` to a valid MCP server URL
- **Disabled**: Leave `MCP_SERVER_URL` empty or unset

MCP status is documented in both the JSON metadata and displayed as a badge in the HTML report.

## Documentation

See [AGENTS.md](AGENTS.md) for detailed documentation on:
- Architecture and components
- Environment variables and model configuration
- MCP integration details
- Development commands

---

This project was created using `bun init` in bun v1.3.3. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
