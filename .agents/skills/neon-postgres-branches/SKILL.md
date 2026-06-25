---
name: neon-postgres-branches
description: >-
  Choose and create the right Neon branch type for testing and development.
  Use when users ask about Neon branching, migration testing with real data,
  isolated test environments, schema-only branch workflows for sensitive data,
  or branch creation via Neon CLI or Neon MCP. Triggers include "Neon branch",
  "test migrations safely", "branch production data", "schema-only branch",
  "reset branch" and "sensitive data testing".
---

# Neon Postgres Branching

The outcome of this skill should be a created Neon branch (or a clear, actionable next step if creation cannot proceed).
Choose the correct branch type, then execute branch creation via MCP or CLI.

- **Normal branch** for realistic migration and query testing with real data.
- **Schema-only branch (Beta)** for sensitive data workflows where structure is needed without copying rows.

## Branch Type Decision

Use this decision rule first:

1. If the user wants to test complex migrations, performance, or behavior against production-like data, choose a **normal branch**.
2. If the user needs to avoid copying sensitive data, choose a **schema-only branch**.

If the request is ambiguous, ask one clarifying question:
"Do you need realistic data for testing, or only schema structure because the data is sensitive?"

## Tool Selection: CLI or MCP

Always support both Neon CLI and Neon MCP server. Prefer the tool the user already has installed and authenticated.

MCP link: https://neon.com/docs/ai/neon-mcp-server.md
CLI link: https://neon.com/docs/reference/cli-quickstart

### Selection order

1. Check MCP first in MCP-enabled environments:
   - If Neon MCP tools are available and authenticated (for example, listing projects works), use MCP.
2. If MCP is unavailable or not authenticated, check CLI:
   - Run `neonctl --version` to confirm CLI is installed.
   - Run `neonctl projects list` to confirm auth/context.
3. If CLI is missing, direct installation via quickstart.
4. If CLI is installed but not authenticated, guide the user through `neonctl auth` (or API key auth), then continue.
5. If both MCP and CLI paths are unsuccessful, use the Neon REST API:
   - https://neon.com/docs/guides/branching-neon-api.md

### MCP branch flow

1. Choose normal vs schema-only based on data sensitivity and migration-testing goals.
2. Use branch tools (for example, `create_branch`) to create the branch.
3. Validate with read tools (for example, `describe_branch`).
4. For migration workflows, prefer branch-based migration flows before applying to main.

## Create a Normal Branch (Preferred for Real-Data Migration Testing)

Use this when the user needs realistic testing conditions.
Real production-like data can expose edge cases your seed or data migration scripts miss, which helps catch migration issues before going live.

Link: https://neon.com/docs/introduction/branching.md

### Steps

1. Use MCP if already available/authenticated; otherwise verify CLI with `neonctl --version`.
2. Ensure project context is set (`neonctl set-context --project-id <your-project-id>`) or include `--project-id` on commands.
3. Create branch:

```bash
neonctl branches create \
  --name <branch-name> \
  --parent <parent-branch-id-or-name> \
  --expires-at 2026-12-15T18:02:16Z
```

4. Optionally fetch a connection string for the new branch:

```bash
neonctl connection-string <branch-name>
```

## Create a Schema-Only Branch (Beta, Sensitive Data)

Use this when users must not copy production rows into the test branch.

Link: https://neon.com/docs/guides/branching-schema-only.md

### Steps

1. Use MCP if already available/authenticated; otherwise verify CLI with `neonctl --version`.
2. Create schema-only branch:

```bash
neonctl branches create \
  --name <schema-only-branch-name> \
  --parent <parent-branch-id-or-name> \
  --schema-only \
  --expires-at 2026-12-15T18:02:16Z
```

If multiple projects exist, include:

```bash
neonctl branches create \
  --name <schema-only-branch-name> \
  --parent <parent-branch-id-or-name> \
  --schema-only \
  --project-id <your-project-id> \
  --expires-at 2026-12-15T18:02:16Z
```

### Beta Support Guidance (Mandatory)

Schema-only branching is in Beta. If users report unexpected behavior, errors, or missing capabilities:

1. Ask them to share feedback in the Neon Console:
   - https://console.neon.tech/app/projects?modal=feedback
2. Recommend opening a support conversation in the Neon Discord:
   - https://discord.gg/92vNTzKDGp

## Reset from parent

Use this when a child branch has drifted and the user wants a clean refresh from the parent branch's latest schema and data.

Link: https://neon.com/docs/guides/reset-from-parent.md
