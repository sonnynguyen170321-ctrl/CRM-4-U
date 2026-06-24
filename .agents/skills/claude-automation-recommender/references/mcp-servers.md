# MCP Server Recommendations

MCP (Model Context Protocol) servers extend Claude's capabilities by connecting to external tools and services.

**Note**: These are common MCP servers. Use web search to find MCP servers specific to the codebase's services and integrations.

## Setup & Team Sharing

**Connection methods:**
1. **Project config** (`.mcp.json`) - Available only in that directory
2. **Global config** (`~/.claude.json`) - Available across all projects
3. **Checked-in `.mcp.json`** - Available to entire team (recommended!)

**Tip**: Check `.mcp.json` into git so your whole team gets the same MCP servers.

**Debugging**: Use `claude --mcp-debug` to identify configuration issues.

## Documentation & Knowledge

### context7
**Best for**: Projects using popular libraries/SDKs where you want Claude to code with up-to-date documentation

| Recommend When | Examples |
|----------------|----------|
| Using React, Vue, Angular | Frontend frameworks |
| Using Express, FastAPI, Django | Backend frameworks |
| Using Prisma, Drizzle | ORMs |
| Using Stripe, Twilio, SendGrid | Third-party APIs |
| Using AWS SDK, Google Cloud | Cloud SDKs |
| Using LangChain, OpenAI SDK | AI/ML libraries |

**Value**: Claude fetches live documentation instead of relying on training data, reducing hallucinated APIs and outdated patterns.

---

## Browser & Frontend

### Playwright MCP
**Best for**: Frontend projects needing browser automation, testing, or screenshots

| Recommend When | Examples |
|----------------|----------|
| React/Vue/Angular app | UI component testing |
| E2E tests needed | User flow validation |
| Visual regression testing | Screenshot comparisons |
| Debugging UI issues | See what user sees |
| Form testing | Multi-step workflows |

**Value**: Claude can interact with your running app, take screenshots, fill forms, and verify UI behavior.

### Puppeteer MCP
**Best for**: Headless browser automation, web scraping

| Recommend When | Examples |
|----------------|----------|
| PDF generation from HTML | Report generation |
| Web scraping tasks | Data extraction |
| Headless testing | CI environments |

---

## Databases

### Supabase MCP
**Best for**: Projects using Supabase for backend/database

| Recommend When | Examples |
|----------------|----------|
| Supabase project detected | `@supabase/supabase-js` in deps |
| Auth + database needs | User management apps |
| Real-time features | Live data sync |

**Value**: Claude can query tables, manage auth, and interact with Supabase storage directly.

### Convex MCP
**Best for**: Projects using Convex as the backend (reactive database + server functions + auth + storage + scheduling, all on one platform)

| Recommend When | Examples |
|----------------|----------|
| Convex project detected | `convex` in deps, `convex/` directory present, `convex.json` at repo root |
| Real-time / reactive UI | `useQuery` / `useMutation` / `useAction` from `convex/react` |
| Mobile + Convex | `convex/react-native` in deps |
| AI / chat / agent features | `convex` vector database or background actions |
