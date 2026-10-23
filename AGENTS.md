# Repository Guidelines

## Project Structure & Module Organization
This repository is a creative and philosophical project centered on "0nefinity" (the identity $0 \equiv 1 \equiv \infty$). It lacks a traditional formal architecture, instead functioning as a collection of HTML, JavaScript, and Markdown experiments.

- **Entry Points**: [./index.html](./index.html) and [./README.html](./README.html) contain the primary explanations and navigation.
- **Global Assets**: [./meta.js](./meta.js) and [./meta.css](./meta.css) govern the global UI: menu behavior (toggle, search) and color schemes. Menu markup comes from the SSI includes in `includes/`; math notation, dialog and dev live-reload live in `tools/` and load only where used.
- **Core Logic**: [./0nefinity.js](./0nefinity.js) is the central script for the 0nefinity theory's manifestations.
- **Tools & Libraries**: Shared utilities and libraries (e.g., [./tools/tools/pixi.js](./tools/tools/pixi.js), [./tools/tools/decimal.js](./tools/tools/decimal.js), [./tools/controls.js](./tools/controls.js)) are located in the [./tools/](./tools/) directory.
- **Archive**: Older versions and raw ideas are kept in [./00_Archiv/](./00_Archiv/).

## Build, Test, and Development Commands
There is no formal build system (no `npm` or `package.json`).
- **Live Preview**: Development is optimized for **Five Server** (VS Code extension), as evidenced by [./fiveserver.config.js](./fiveserver.config.js).
- **Utility Scripts**: Occasional Python ([./py.py](./py.py), [./errorpages/err.py](./errorpages/err.py)) and PHP ([./tools/generate-structure.php](./tools/generate-structure.php)) scripts are used for content generation or server-side tasks.

## Coding Style & Naming Conventions
The codebase is informal and experimental. AI agents should adhere to the following rules:
- **Language**: Communication with the user should be in **German**, even if the project uses a hybrid of German and English.
- **0nefinity Philosophy**: Controls and logic should always support `0` as a valid input and strive for "unlimited" ranges (approaching $\infty$).
- **Styling**: Always respect [./meta.css](./meta.css) for colors. The author notes that `meta.css` often uses `!important` to enforce the aesthetic.
- **UI Components**: Use [./meta.js](./meta.js), [./tools/controls.js](./tools/controls.js), and [./tools/zoom.js](./tools/zoom.js) for standard interactions.
- **Efficiency**: Code should remain smooth even on older hardware ("Gurke").
- **Naming**: File names are descriptive, often in German, and may contain spaces or emojis.

## Commit Guidelines
Commit messages are informal and often in German or a mix of German and English (e.g., "zwischenspeichern", "018 ascii animation, yeah"). No specific prefix or format is required, but clarity regarding the "nuggets" or "experiments" added is preferred.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **0nefinity.love** (3227 symbols, 5600 relationships, 268 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/0nefinity.love/context` | Codebase overview, check index freshness |
| `gitnexus://repo/0nefinity.love/clusters` | All functional areas |
| `gitnexus://repo/0nefinity.love/processes` | All execution flows |
| `gitnexus://repo/0nefinity.love/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
