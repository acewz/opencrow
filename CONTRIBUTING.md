# Contributing to OpenCrow

Thanks for your interest in contributing to OpenCrow! This guide will help you get started.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/<your-username>/opencrow.git`
3. Install dependencies: `bun install`
4. Copy environment config: `cp .env.example .env`
5. Start services: `docker compose up -d`
6. Run in dev mode: `bun run dev`

## Development Workflow

1. Create a feature branch from `master`: `git checkout -b feat/your-feature`
2. Make your changes
3. Run type checking: `bun run typecheck`
4. Run tests: `bun test`
5. Commit using [conventional commits](#commit-messages)
6. Push and open a Pull Request against `master`

## Commit Messages

We use conventional commits:

```
feat: add new scraper for X
fix: resolve memory leak in agent sessions
refactor: simplify tool routing logic
docs: update setup instructions
test: add tests for cron scheduler
chore: update dependencies
perf: optimize vector search query
```

## Project Structure

- `src/agent/` - Agent SDK integration and MCP bridge
- `src/channels/` - Telegram, WhatsApp, Web channel plugins
- `src/sources/` - Data scrapers (each in its own directory)
- `src/tools/` - Tool definitions and registry
- `src/web/` - Hono API routes and React SPA
- `src/memory/` - RAG pipeline and vector search

## Adding a New Tool

1. Create a file in `src/tools/` following the `ToolDefinition` interface
2. Define the JSON Schema for parameters
3. Implement the `execute` function
4. Register it in the tool registry

## Adding a New Scraper

1. Create a directory in `src/sources/<name>/`
2. Implement the scraper following existing patterns
3. Add it to the process manifest
4. Add corresponding search/digest tools

## Code Style

- TypeScript with strict mode
- Immutable patterns (no mutation)
- Small, focused files (< 800 lines)
- Zod for input validation
- Error handling on all async operations

## Pull Requests

- Keep PRs focused on a single change
- Include a clear description of what and why
- Ensure `bun run typecheck` passes
- Add tests for new functionality
- Update documentation if needed

## Reporting Bugs

Open an issue with:
- Steps to reproduce
- Expected behavior
- Actual behavior
- Environment details (OS, Bun version)

## Questions?

Open a discussion on GitHub or reach out to the maintainers.
