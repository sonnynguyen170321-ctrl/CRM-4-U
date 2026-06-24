# Subagent Recommendations

Subagents are specialized Claude instances that run in parallel, each with their own context window and tool access. They're ideal for focused reviews, analysis, or generation tasks.

**Note**: These are common patterns. Design custom subagents based on the codebase's specific review and analysis needs.

## Code Review Agents

### code-reviewer
**Best for**: Automated code quality checks on large codebases

| Recommend When | Detection |
|----------------|-----------|
| Large codebase (>500 files) | File count |
| Frequent code changes | Active development |
| Team wants consistent review | Quality focus |

**Value**: Runs code review in parallel while you continue working
**Model**: sonnet (balanced quality/speed)
**Tools**: Read, Grep, Glob, Bash

---

### security-reviewer
**Best for**: Security-focused code review

| Recommend When | Detection |
|----------------|-----------|
| Auth code present | `auth/`, `login`, `session` patterns |
| Payment processing | `stripe`, `payment`, `billing` patterns |
| User data handling | `user`, `profile`, `pii` patterns |
| API keys in code | Environment variable patterns |

**Value**: Catches OWASP vulnerabilities, auth issues, data exposure
**Model**: sonnet
**Tools**: Read, Grep, Glob (read-only for safety)

---

### test-writer
**Best for**: Generating comprehensive test coverage

| Recommend When | Detection |
|----------------|-----------|
| Low test coverage | Few test files vs source files |
| Test suite exists | `tests/`, `__tests__/` present |
| Testing framework configured | jest, pytest, vitest in deps |

**Value**: Generates tests matching project conventions
**Model**: sonnet
**Tools**: Read, Write, Grep, Glob

---

## Specialized Agents

### api-documenter
**Best for**: API documentation generation

| Recommend When | Detection |
|----------------|-----------|
| REST endpoints | Express routes, FastAPI paths |
| GraphQL schema | `.graphql` files present |
| Need public API docs | Client SDK generation |

**Value**: Generates structured, compliant documentation
**Model**: sonnet
**Tools**: Read, Write, Grep, Glob
