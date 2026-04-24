---
name: gsd:set-profile
description: Switch model profile for GSD agents (quality/balanced/budget/inherit)
argument-hint: <profile (quality|balanced|budget|inherit)>
model: haiku
allowed-tools:
  - Bash
---

Show the following output to the user verbatim, with no extra commentary:

!`if ! command -v gsd-remix-sdk >/dev/null 2>&1; then printf '⚠ gsd-remix-sdk not found in PATH — /gsd-set-profile requires it.\n\nRepair the bundled SDK:\n  /gsd-health --runtime --repair\n\nOr refresh all runtime assets:\n  /gsd-update\n'; exit 1; fi; gsd-remix-sdk query config-set-model-profile $ARGUMENTS --raw`
