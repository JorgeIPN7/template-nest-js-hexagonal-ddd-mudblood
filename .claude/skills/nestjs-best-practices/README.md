# NestJS Best Practices

📖 [For Humans <3](https://kadajett.github.io/agent-nestjs-skills/)

A structured repository for creating and maintaining NestJS Best Practices optimized for agents and LLMs.

> **This copy is vendored and adapted.** The rules here target **NestJS 12** (`nestVersion` in `metadata.json`), were checked against the 12.1.0 packages, and are paired with this repo's conventions (see "Integration with Hexagonal / DDD layers" in `SKILL.md`). The installation commands below fetch the original upstream skill, not this copy.

## Installation

Install the upstream skill using [skills](https://github.com/vercel-labs/skills):

```bash
# GitHub shorthand
npx skills add Kadajett/agent-nestjs-skills

# Install globally (available across all projects)
npx skills add Kadajett/agent-nestjs-skills --global

# Install for specific agents
npx skills add Kadajett/agent-nestjs-skills -a claude-code -a cursor
```

### Supported Agents

- Claude Code
- OpenCode
- Codex
- Cursor
- Antigravity
- Roo Code

## Structure

- `rules/` - Individual rule files (one per rule)
  - `_sections.md` - Section metadata (titles, impacts, descriptions)
  - `_template.md` - Template for creating new rules
  - `area-description.md` - Individual rule files
- `scripts/` - Build scripts and utilities
- `metadata.json` - Document metadata (version, organization, abstract)
- __`AGENTS.md`__ - Compiled output (generated)

## Getting Started

Build AGENTS.md from `rules/*.md` and `metadata.json`:

```bash
cd scripts && node build-agents.ts
```

Nothing to install: the script only uses Node built-ins (`fs`, `path`, `url`), and on Node 24 — the version this repo pins — `node` strips its TypeScript types natively. The upstream entry points, `npm run build` and `./scripts/build.sh`, run the same file through `npx ts-node`, which pulls `ts-node` from the npm registry. This repo uses pnpm only, so stick to the plain `node` call.

## Creating a New Rule

1. Copy `rules/_template.md` to `rules/area-description.md`
2. Choose the appropriate area prefix:
   - `arch-` for Architecture (Section 1)
   - `di-` for Dependency Injection (Section 2)
   - `error-` for Error Handling (Section 3)
   - `security-` for Security (Section 4)
   - `perf-` for Performance (Section 5)
   - `test-` for Testing (Section 6)
   - `db-` for Database & ORM (Section 7)
   - `api-` for API Design (Section 8)
   - `micro-` for Microservices (Section 9)
   - `devops-` for DevOps & Deployment (Section 10)
3. Fill in the frontmatter and content
4. Ensure you have clear examples with explanations
5. Run the build script to regenerate AGENTS.md

## Rule File Structure

Each rule file should follow this structure:

````markdown
---
title: Rule Title Here
impact: MEDIUM
impactDescription: Optional description
tags: tag1, tag2, tag3
---

## Rule Title Here

Brief explanation of the rule and why it matters.

**Incorrect (description of what's wrong):**

```typescript
// Bad code example
```

**Correct (description of what's right):**

```typescript
// Good code example
```

Optional explanatory text after examples.

Reference: [NestJS Documentation](https://docs.nestjs.com)
````

Version-specific notes go in a blockquote right after the intro paragraph: `> **NestJS 12 note:** …` for behavior new in v12, and `> **Since v11:** …` (or `Since NestJS 11 (still true in 12)`) for a v11 change that still holds. Tag the rule `v12`, plus `v11` / `v11+` when it keeps a v11 note.

## File Naming Convention

- Files starting with `_` are special (excluded from build)
- Rule files: `area-description.md` (e.g., `arch-avoid-circular-deps.md`)
- Section is automatically inferred from filename prefix
- Rules are sorted alphabetically by **filename** within each section (so `api-middleware-wildcards` is 8.1 even though its title does not sort first)
- IDs (e.g., 1.1, 1.2) are auto-generated during build

## Impact Levels

| Level | Description |
|-------|-------------|
| CRITICAL | Violations cause runtime errors, security vulnerabilities, or architectural breakdown |
| HIGH | Significant impact on reliability, security, or maintainability |
| MEDIUM-HIGH | Notable impact on quality and developer experience |
| MEDIUM | Moderate impact on code quality and best practices |
| LOW-MEDIUM | Minor improvements for consistency and maintainability |

## Scripts

- `node build-agents.ts` (in scripts/) - Compile rules into AGENTS.md

## Contributing

When adding or modifying rules:

1. Use the correct filename prefix for your section
2. Follow the `_template.md` structure
3. Include clear bad/good examples with explanations
4. Add appropriate tags
5. Run the build script to regenerate AGENTS.md
6. Rules are automatically sorted by filename - no need to manage numbers!

## Documentation Website

The documentation website source code lives on the [`docs` branch](https://github.com/Kadajett/agent-nestjs-skills/tree/docs/website). This separation keeps the skill installation lightweight while maintaining the full documentation site.

To contribute to the website:

```bash
git checkout docs
cd website
npm install
npm run dev
```

## Acknowledgments

- Inspired by the [Vercel React Best Practices](https://github.com/vercel-labs/agent-skills) skill structure
- Compatible with [skills](https://github.com/vercel-labs/skills) for easy installation across coding agents

## Compatible Agents

These NestJS skills work with:

- [Claude Code](https://claude.ai/code) - Anthropic's official CLI
- [AdaL](https://sylph.ai/adal) - Self-evolving AI coding agent with MCP support

