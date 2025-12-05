# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A TypeScript project running on Bun runtime. The project uses modern TypeScript features with strict type checking enabled.

## Development Commands

```bash
# Install dependencies
bun install

# Run the main entry point
bun run index.ts

# Run TypeScript type checking
bun tsc --noEmit
```

## TypeScript Configuration

- **Runtime**: Bun (not Node.js)
- **Module System**: ESNext with `module: "Preserve"` and `moduleResolution: "bundler"`
- **Strict Mode**: Enabled with additional checks:
  - `noUncheckedIndexedAccess: true` - array/index access always includes undefined
  - `noImplicitOverride: true` - override keyword required
  - `noFallthroughCasesInSwitch: true`
- **Import Extensions**: `.ts` extensions allowed in imports
- **No Emit**: This is a Bun-only project, TypeScript compilation not required
