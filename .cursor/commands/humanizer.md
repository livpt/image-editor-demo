---
name: humanizer
description: "Rewrite AI-sounding text so it reads like you wrote it. Usage: /humanizer [text or path/to/file.md]"
---

Read and follow `.cursor/skills/humanizer/SKILL.md` before you do anything else.

**Input from the slash command:** $ARGUMENTS

How to interpret it:

1. **No arguments** — Humanize whatever the user selected in the editor. If nothing is selected, ask once for pasted text or a file path, then proceed.
2. **A path** — If `$ARGUMENTS` looks like a file path and the file exists, use **file mode** from the skill: rewrite prose only; leave code blocks, inline code, commands, paths, YAML front matter, data, and link targets unchanged; write the final text back to that file; then give a short summary of what you changed.
3. **Anything else** — Treat `$ARGUMENTS` as pasted text. Use the skill’s default return format (draft notes optional, list any tells you could not fix, then the final rewrite).

Match the writer’s voice when you have a sample; otherwise keep the tone appropriate to the kind of text (interview prep and notes: plain, direct British English).

Do not add facts, numbers, quotes, or citations that are not in the source.
