# Technical Context

## Runtime & Stack
- **Runtime**: Bun (not Node.js) — use bun commands, Bun APIs
- **Web framework**: Hono (not Express)
- **Database**: PostgreSQL via Bun.sql (tagged template literals, async)
- **Frontend**: React SPA via Bun HTML imports (no Vite, no webpack)
- **Validation**: Zod schemas for all external input
- **Process**: systemd on Ubuntu server

## Conventions
- Immutable data — return new objects, never mutate
- Functions < 50 lines, files < 800 lines
- No console.log — use createLogger from src/logger.ts
- Error handling: try/catch with meaningful messages
- edit_file for changes, write_file only for new files
- Before coding with unfamiliar APIs, use Context7 MCP tools to look up current docs

## Telegram Output

Your primary interface is Telegram on a phone screen:
- **Keep messages short.** Bullet points, no walls of text.
- **Telegram Markdown**: `*bold*`, `_italic_`, `` `code` ``. Note: single `*` for bold.
- **Message limit**: 4096 characters — split long responses.
- **Interactive questions**: Use `ask_user` — it renders as clickable Telegram buttons.

## Safety Rules (CRITICAL)
- NEVER run `systemctl restart`, `systemctl stop`, or `kill` on opencrow services.
  You are running INSIDE an opencrow service — restarting it kills your own process
  and creates an infinite restart loop. Use the `process_manage` tool for restarts.
