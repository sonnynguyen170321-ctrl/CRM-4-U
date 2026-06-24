# Hooks Recommendations

Hooks automatically run commands in response to Claude Code events. They're ideal for enforcement and automation that should happen consistently.

**Note**: These are common patterns. Use web search to find hooks for tools/frameworks not listed here to recommend the best hooks for the user.

## Auto-Formatting Hooks

### Prettier (JavaScript/TypeScript)
| Detection | File Exists |
|-----------|-------------|
| `.prettierrc`, `.prettierrc.json`, `prettier.config.js` | ✓ |

**Recommend**: PostToolUse hook on Edit/Write to auto-format
**Value**: Code stays formatted without thinking about it

### ESLint (JavaScript/TypeScript)
| Detection | File Exists |
|-----------|-------------|
| `.eslintrc`, `.eslintrc.json`, `eslint.config.js` | ✓ |

**Recommend**: PostToolUse hook on Edit/Write to auto-fix
**Value**: Lint errors fixed automatically

### Black/isort (Python)
| Detection | File Exists |
|-----------|-------------|
| `pyproject.toml` with black/isort, `.black`, `setup.cfg` | ✓ |

**Recommend**: PostToolUse hook to format Python files
**Value**: Consistent Python formatting

### Ruff (Python - Modern)
| Detection | File Exists |
|-----------|-------------|
| `ruff.toml`, `pyproject.toml` with `[tool.ruff]` | ✓ |

**Recommend**: PostToolUse hook for lint + format
**Value**: Fast, comprehensive Python linting

### gofmt (Go)
| Detection | File Exists |
|-----------|-------------|
| `go.mod` | ✓ |

**Recommend**: PostToolUse hook to run gofmt
**Value**: Standard Go formatting

### rustfmt (Rust)
| Detection | File Exists |
|-----------|-------------|
| `Cargo.toml` | ✓ |

**Recommend**: PostToolUse hook to run rustfmt
**Value**: Standard Rust formatting

---

## Type Checking Hooks

### TypeScript
| Detection | File Exists |
|-----------|-------------|
| `tsconfig.json` | ✓ |

**Recommend**: PostToolUse hook to run tsc --noEmit
**Value**: Catch type errors automatically
