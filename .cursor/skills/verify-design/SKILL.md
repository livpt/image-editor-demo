---
name: verify-design
description: Check the image editor UI against the Cursor design tokens. Use after any change to styles.css, index.html, index.js, layers.js, or layer-drag.js, and before claiming a restyle or UI visual change is done.
---

# Verify the design system

Two checks. `scripts/check-tokens.mjs` reads `styles.css` and rejects colour literals outside `:root`, and any `font-family` that is not a `var(--font-...)` stack. The user-dembrandt MCP tools read the running page and compare it with the saved cursor.com extraction in [baseline.cursor.com.json](baseline.cursor.com.json). Evidence goes under `/tmp/image-editor-verify/evidence/`.

The page under test is the isolated Vite server from [verify-image-editor](../verify-image-editor/SKILL.md). Reuse that skill's control script. The harness port is 5199. The control script refuses port 5173.

## Launch

```sh
.cursor/skills/verify-image-editor/scripts/control.sh up
```

Prints `up (pid N) at http://127.0.0.1:5199/` once the page serves `<title>Simple Web Image Editor</title>`. Run `up`, `doctor`, `evidence`, and `down` outside the sandbox (they bind a port and write to `/tmp`).

Teardown is `down` (see Cleanup).

## Doctor

```sh
.cursor/skills/verify-image-editor/scripts/control.sh doctor
```

Run `doctor` first when the page behaves oddly. Exit 0 means the recorded pid is alive, it owns port 5199, and the page serves the right title. A `FOREIGN` port is someone else's server; leave it alone.

## Token check

```sh
node .cursor/skills/verify-design/scripts/check-tokens.mjs
```

The script resolves `styles.css` from the repository root (four directories above the script file), independent of the shell's working directory. Comments are ignored. A colour literal (`#` followed by 3, 4, 6, or 8 hex digits, or `rgb(`, `rgba(`, `hsl(`, `hsla(`) may appear only inside a `:root` rule. A `font-family` value must be a single `var(--font-...)` call, or a comma-separated stack in which every family is one of those calls.

Violations print as `styles.css:<line>: <reason>`. Exit 0 is required for a pass. Exit 1 means violations were printed. Exit 2 means `styles.css` is missing.

On the current `styles.css` the script exits 1, because colour literals sit outside `:root` and the `font-family` stack is not `var(--font-...)`. That failure is the acceptance test the restyle must turn green.

## Dembrandt

Use the user-dembrandt MCP tools. `check_robots` is unnecessary for localhost.

1. `.cursor/skills/verify-image-editor/scripts/control.sh up`
2. Call `get_design_tokens` on `http://127.0.0.1:5199/` with `slow: true`. The call returns a `job_id`. Poll `get_job_status` with that id until the job completes. If the Dembrandt browser cannot reach localhost, record the failure in the evidence directory and stop the Dembrandt half. The token script still counts.
3. Call `check_contrast` with these pairs, graded as body text (omit font size and weight):
   - text on surface: foreground `#000000`, background `#F2F1ED`
   - button label on button: foreground `#F7F7F4`, background `#26251E`
4. Call `get_findings` with the editor extraction's `job_id`. Record near-duplicate colours and radius sprawl.
5. Call `compute_drift` with `baseline` set to the parsed object in `.cursor/skills/verify-design/baseline.cursor.com.json` and `candidateJobId` set to the editor job. Omit `baselineJobId`. Omit `failThreshold`. Report the 0–100 score (0 means identical). The score is a report, and it is not a pass/fail gate. An app will never score 0 against a marketing page.

The baseline file is the Dembrandt extraction result for `https://cursor.com/` (site name Cursor). Pass that object as `baseline`. The editor job supplies the candidate, so the candidate extraction stays in the job queue.

Palette check, after a completed editor extraction: every `colors.palette[].normalized` hex must be a colour literal written inside the `:root` rule in `styles.css`. Compare hex case-insensitively, and treat a 3-digit form as the same colour as its 6-digit form.

## Pass

All of these:

- `check-tokens.mjs` exits 0.
- Every palette colour Dembrandt sees in the editor is one of the `:root` tokens.
- Both contrast pairs meet WCAG AA.
- Drift is reported, and it is not gated.

If the Dembrandt browser cannot reach localhost, record that and stop the Dembrandt half. The token script's exit code still stands. Palette, contrast, and drift were not run, so those checks are not a pass.

## Evidence

`.cursor/skills/verify-image-editor/scripts/control.sh evidence` prints and creates `/tmp/image-editor-verify/evidence/<RUN_ID>/`. Put there:

- `tokens.txt`: the token script's stdout or stderr, and its exit code.
- `dembrandt.txt`: the editor `job_id` and URL, or the note that the Dembrandt browser could not reach localhost.
- `contrast.json`: the `check_contrast` result for the two pairs.
- `findings.json`: the `get_findings` result (near-duplicate colours and radius sprawl are the part to read).
- `drift.json`: the `compute_drift` result, including the score.

## Cleanup

```sh
.cursor/skills/verify-image-editor/scripts/control.sh down
```

Stops only the pid recorded for this harness. Evidence under `/tmp/image-editor-verify/evidence/` is kept. Run `down` after a failed run too, so the port is not stranded.

## Helpers

| Script | How to run | Purpose |
| --- | --- | --- |
| `.cursor/skills/verify-image-editor/scripts/control.sh up\|doctor\|evidence\|down` | shell, outside the sandbox | server lifecycle and evidence dir (port 5199) |
| `.cursor/skills/verify-design/scripts/check-tokens.mjs` | `node` | colour literals outside `:root`, and `font-family` stacks |
| `.cursor/skills/verify-design/baseline.cursor.com.json` | pass as `compute_drift` `baseline` | saved cursor.com extraction |
