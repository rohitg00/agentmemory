---
name: write-agentmemory-skill
description: The house format and rules for writing or updating an agentmemory skill. Use when adding a new skill, restructuring an existing one, or reviewing a skill contribution for consistency.
user-invocable: false
---

agentmemory skills follow one tiered format so they stay skimmable, accurate, and current. Match it exactly.

## Directory layout

```text
plugin/skills/<name>/
  SKILL.md      (required, under 100 lines)
  REFERENCE.md  (optional, dense facts; auto-generate data tables)
  EXAMPLES.md   (optional, worked transcripts)
```

## SKILL.md rules

- Frontmatter: `name`, `description`, optional `argument-hint`, and `user-invocable`. Set `user-invocable: true` only for skills the user runs as a slash command; reference and knowledge skills are `false`.
- Description is two sentences and the only thing the agent sees when deciding to load the skill. Sentence one states the capability. Sentence two starts "Use when" and lists concrete triggers. Keep it distinct from sibling skills, under 1024 chars, third person.
- Body order: Quick start (one concrete example), Why (the governing principle), Workflow (numbered steps with decision gates), Anti-patterns (a WRONG vs RIGHT callout for the top mistake), Checklist, See also (cross-link siblings), Reference or Troubleshooting pointer.
- Stay under 100 lines. Move dense facts to REFERENCE.md and examples to EXAMPLES.md.
- Cross-references link one level deep only. Shared recovery steps live in `../_shared/TROUBLESHOOTING.md`, never inlined.

## Keep it current

Facts that exist in source (tool names and parameters, REST endpoints, env vars, connect adapters, hook events) are generated, never hand-typed. Edit the source, then run `npm run skills:gen`. CI runs `npm run skills:check` and fails on drift, so generated tables cannot fall behind the code.

## Style

No external or competitor product names. No emojis. No em-dashes. No filler. State the thing and stop.

## Checklist

- Description has a "Use when" sentence with real triggers.
- SKILL.md is under 100 lines.
- No time-sensitive claims and no duplicated troubleshooting block.
- Concrete example present; generated facts come from the generator.
- Cross-links resolve and go one level deep.
