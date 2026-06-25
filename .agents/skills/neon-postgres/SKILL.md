---
name: neon-postgres
description: >-
  Guides and best practices for working with Neon Serverless Postgres.
  Covers setup, connection methods, branching, autoscaling, scale-to-zero,
  read replicas, connection pooling, Neon Auth, and the Neon CLI, MCP server,
  REST API, TypeScript SDK, and Python SDK.
  Use when users ask about "Neon setup", "connect to Neon", "Neon project",
  "DATABASE_URL", "serverless Postgres", "Neon CLI", "neonctl", "Neon MCP",
  "Neon Auth", "@neondatabase/serverless", "@neondatabase/neon-js",
  "scale to zero", "Neon autoscaling", "Neon read replica", or
  "Neon connection pooling".
---

# Neon Serverless Postgres

Guide the user through any Neon-related task: setup, connections, branching, and advanced features. Deliver a working Neon connection, a completed feature configuration, or a specific answer from the official Neon docs.

Neon is a serverless Postgres platform that separates compute and storage to offer autoscaling, branching, instant restore, and scale-to-zero. It's fully compatible with Postgres and works with any language, framework, or ORM that supports Postgres.

## Neon Documentation

The Neon documentation is the source of truth for all Neon-related information. Always verify claims against the official docs before responding. Neon features and APIs evolve, so prefer fetching current docs over relying on training data.

### Fetching Docs as Markdown

Any Neon doc page can be fetched as markdown in two ways:

1. **Append `.md` to the URL** (simplest): https://neon.com/docs/introduction/branching.md
2. **Request `text/markdown`** on the standard URL: `curl -H "Accept: text/markdown" https://neon.com/docs/introduction/branching`

Both return the same markdown content. Use whichever method your tools support.

### Finding the Right Page

The docs index lists every available page with its URL and a short description:

```
https://neon.com/docs/llms.txt
```

Common doc URLs are organized in the topic links below. If you need a page not listed here, search the docs index: https://neon.com/docs/llms.txt. Don't guess URLs.

## What Is Neon

Use this for architecture explanations and terminology (organizations, projects, branches, endpoints) before giving implementation advice.

Link: https://neon.com/docs/introduction/architecture-overview.md

## Getting Started

Use this section when guiding a user through first-time Neon setup.

### Check Status Quo

Before starting setup, inspect the user's codebase and environment:

- Existing database connection code
- Existing Neon MCP server or Neon CLI configuration
- Existence of a `.env` file and `DATABASE_URL` environment variable
- Existing ORM (Prisma, Drizzle, TypeORM) configuration

### Self-Driving Setup With Neon's CLI or MCP Server

Offer to inspect existing connected Neon projects or create new ones using the Neon CLI or MCP server. If neither is set up yet, run init with the `--agent` flag. Use `npx -y` to skip the package install prompt. Auth is handled automatically. If the user is not logged in, it opens their browser for OAuth and waits for completion before proceeding.

```bash
npx -y neonctl@latest init --agent <agent-name>
```

Supported `--agent` values: `cursor`, `copilot`, `claude`, `claude-desktop`, `codex`, `opencode`, `cline`, `gemini-cli`, `goose`, `zed`.

This installs the Neon extension (for Cursor/VS Code) or MCP server (for other agents), creates an API key, and adds the `neon-postgres` agent skill to the project.

If `init` is not suitable, the individual steps can be run non-interactively:

- **Extension:** `cursor --install-extension databricks.neon-local-connect`
- **MCP server:** `npx -y add-mcp https://mcp.neon.tech/mcp -g -n Neon -y -a <agent-name>`
- **Agent skill:** `npx skills add neondatabase/agent-skills --skill neon-postgres --agent <agent-name> -y`

For full CLI installation options, see https://neon.com/docs/reference/cli-install.md

### Setup Flow

**1. Select Organization and Project**

Use MCP server or CLI to list organizations and projects. Let the user select an existing project or create a new one.

**2. Get Connection String**

Use MCP server or CLI to get the connection string. Store it in `.env` as `DATABASE_URL`. Read the file first before modifying to avoid overwriting existing values.

**3. Pick Connection Method & Driver**

Refer to the connection methods guide to pick the correct driver based on deployment platform: https://neon.com/docs/connect/choose-connection.md

**4. User Authentication with Neon Auth (if needed)**

Skip for CLI tools, scripts, or apps without user accounts. If the app needs auth: use MCP server `provision_neon_auth` tool, then see the auth overview (https://neon.com/docs/auth/overview.md) for setup. For auth + database queries, see the JavaScript SDK reference (https://neon.com/docs/reference/javascript-sdk.md).

**5. ORM Setup (optional)**

Check for existing ORM (Prisma, Drizzle, TypeORM). If none, ask if they want one. For Drizzle integration, see https://neon.com/docs/guides/drizzle.md.

**6. Schema Setup**

- Check for existing migration files or ORM schemas
- If none: offer to create an example schema or design one together

### Resume Support

If resuming setup, check what's already configured (MCP connection, `.env` with `DATABASE_URL`, dependencies, schema) and continue from the next incomplete step.

### Security Reminders

Remind users to use environment variables for credentials, never commit connection strings, and use least-privilege database roles.

## Connection Methods & Drivers

Use this when you need to pick the correct transport and driver based on runtime constraints (TCP, HTTP, WebSocket, edge, serverless, long-running).

Link: https://neon.com/docs/connect/choose-connection.md

### Recommended: Drizzle + the right driver for your runtime

Always pair Neon with an ORM such as **Drizzle** for easy schema management and migrations. Pick the driver based on how the runtime treats your code:

- **Long-running or shared-runtime environments → node-postgres (`pg`).** Neon
