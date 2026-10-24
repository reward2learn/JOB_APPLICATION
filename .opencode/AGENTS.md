# Opencode Agent Architecture

## Agent Types

### Director Agent (Central Orchestrator)
- **Role**: Receives high-level tasks, decomposes into atomic sub-tasks, delegates to sub-agents, aggregates results
- **Tools**: `create_task`, `list_tasks`, `read_task`, `update_task_progress`, `run_background_process`, `list_background_processes`, `stop_background_process`
- **Workflow**: RECEIVE → ANALYZE → DELEGATE → MONITOR → AGGREGATE → VALIDATE → REPORT

### Coder Agent (Implementation)
- **Role**: Individual file implementation - precise, scoped code changes to single file or focused file set
- **Tools**: `read`, `write`, `edit`, `glob`, `grep`
- **Use for**: HTML, JS, CSS, JSON, TS, TSX changes

### Reviewer Agent (Quality Gate)
- **Role**: Reviews code against ALL project standards - code quality, frontend, state management, mobile, database, security
- **Tools**: `read`, `glob`, `grep`, `bash`
- **Read-only**: No write permissions

### Test Engineer Agent
- **Role**: Runs, debugs, fixes test failures
- **Tools**: `bash`, `read`, `write`, `edit`, `glob`, `grep`
- **Write**: Test files only (`**/*.test.*`, `**/*.spec.*`)

### Build Agent
- **Role**: Runs type-check, lint, production build on modified files
- **Tools**: `bash`
- **Validates**: Code before gate review

### Context Scout Agent
- **Role**: Discovers all relevant context files for a given domain - loads standards, domain docs, project intelligence in parallel
- **Tools**: `read`, `glob`, `grep`

### External Scout Agent
- **Role**: Fetches live documentation from external sources - package APIs, framework docs, specification pages
- **Tools**: `bash`, `websearch`, `webfetch`

### Doc Writer Agent
- **Role**: Generates migration patterns documentation, knowledge base entries, architecture guides
- **Tools**: `read`, `write`, `edit`, `glob`, `grep`
- **Write**: `.md`, `.txt` files only

### DB Admin Agent
- **Role**: Database operations - schema management, migrations, seeding, health checks
- **Tools**: `bash`, `read`, `write`, `edit`
- **Write**: Migrations, seeds, schema files only

### Security Auditor Agent
- **Role**: Read-only security audit - vulnerability scanning and code review
- **Tools**: `read`, `glob`, `grep`, `bash`
- **Read-only**: No write permissions

## Delegation Patterns

### Pattern 1: Sequential (dependent steps)
```yaml
steps:
  - agent: coder       # Schema first
  - agent: coder       # API depends on schema
  - agent: coder       # UI depends on API
```

### Pattern 2: Dynamic parallel sub-agents
```javascript
create_task(intent="Design DB schema", agentType="coder", context='{"files": ["schema.sql"]}')
create_task(intent="Create API route", agentType="coder", context='{"files": ["api/route.ts"]}')
// Monitor via list_tasks(), read_task()
```

### Pattern 3: Review gate
After implementation, create review task:
```javascript
create_task(intent="Review implementation", agentType="reviewer", context='{"taskIds": ["TASK-abc", "TASK-def"]}')
```

## Validation Gates
After any implementation phase, run applicable checks:
- `bun run type-check`
- `bun run lint`
- `bun run test`
- `bun run build`

## Communication Protocol
- Summarize plan before executing
- Report what changed, why, and any follow-ups
- Flag blocking issues early
- Use task progress fields for long-running operations

## Task File Format
Tasks stored in `.opencode/tasks/todo/TASK-{slug}.md` with YAML frontmatter:
```yaml
---
taskId: TASK-abc123
intent: "Description of work"
agentType: coder
context: {"files": ["path/to/file"]}
progress_stage: "in_progress"
progress_message: "Working on..."
progress_pct: 50
---
```