---
name: neon-postgres-egress-optimizer
description: >-
  Diagnose and fix excessive Postgres egress (network data transfer) in a codebase.
  Use when a user mentions high database bills, unexpected data transfer costs,
  network transfer charges, egress spikes, "why is my Neon bill so high",
  "database costs jumped", SELECT * optimization, query overfetching,
  reduce Neon costs, optimize database usage, or wants to reduce data sent
  from their database to their application. Also use when reviewing query
  patterns for cost efficiency, even if the user doesn't explicitly mention
  egress or data transfer.
---

# Postgres Egress Optimizer

Guide the user through diagnosing and fixing application-side query patterns that cause excessive data transfer (egress) from their Postgres database. Most high egress bills come from the application fetching more data than it uses.

## Step 1: Diagnose

Identify which queries transfer the most data. The primary tool is the `pg_stat_statements` extension.

### Check if pg_stat_statements is available

```sql
SELECT 1 FROM pg_stat_statements LIMIT 1;
```

If this errors, the extension needs to be created:

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

On Neon, it is available by default but may need this CREATE EXTENSION step.

### Handle empty stats

Stats are cleared when a Neon compute scales to zero and restarts. If the stats are empty or the compute recently woke up:

1. Reset the stats to start a clean measurement window: `SELECT pg_stat_statements_reset();`
2. Let the application run under representative traffic for at least an hour.
3. Return and run the diagnostic queries below.

If the user has stats from a production database, use those. If they have no access to production stats, proceed to Step 2 and analyze the codebase directly — code-level patterns are often sufficient to identify the worst offenders.

### Diagnostic queries

Run these to identify the top egress contributors. Focus on queries that return many rows, return wide rows (JSONB, TEXT, BYTEA columns), or are called very frequently.

**Queries returning the most total rows:**

```sql
SELECT query, calls, rows AS total_rows, rows / calls AS avg_rows_per_call
FROM pg_stat_statements
WHERE calls > 0
ORDER BY rows DESC
LIMIT 10;
```

**Queries returning the most rows per execution** (poorly scoped SELECTs, missing pagination):

```sql
SELECT query, calls, rows AS total_rows, rows / calls AS avg_rows_per_call
FROM pg_stat_statements
WHERE calls > 0
ORDER BY avg_rows_per_call DESC
LIMIT 10;
```

**Most frequently called queries** (candidates for caching):

```sql
SELECT query, calls, rows AS total_rows, rows / calls AS avg_rows_per_call
FROM pg_stat_statements
WHERE calls > 0
ORDER BY calls DESC
LIMIT 10;
```

**Longest running queries** (not a direct egress measure, but helps identify problem queries during a spike):

```sql
SELECT query, calls, rows AS total_rows,
  round(total_exec_time::numeric, 2) AS total_exec_time_ms
FROM pg_stat_statements
WHERE calls > 0
ORDER BY total_exec_time DESC
LIMIT 10;
```

### Interpret the results

Rank findings by estimated egress impact:

- **High row count + wide rows** = biggest egress. A query returning 1,000 rows where each row includes a 50KB JSONB column transfers ~50MB per call.
- **Extreme call frequency** on even small queries adds up. A query called 50,000 times/day returning 10 rows each = 500,000 rows/day.
- **Cross-reference with the schema** to identify which columns are wide. Look for JSONB, TEXT, BYTEA, and large VARCHAR columns.

## Step 2: Analyze codebase

For each query identified in Step 1, or for each database query in the codebase if no stats are available, check:

- Does it select only the columns the response needs?
- Does it return a bounded number of rows (LIMIT/pagination)?
- Is it called frequently enough to benefit from application-level caching?
