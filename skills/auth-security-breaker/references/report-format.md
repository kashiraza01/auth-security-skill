# Report format

Two artefacts. `findings.json` (machine, `finding.schema.json`) is authoritative and is what the
hardener and the loop consume. The Markdown report is for humans.

## findings.json

Emitted by `scripts/audit.mjs`. One object per finding, conforming to `finding.schema.json`. The
`id` is the stable join key across iterations — never rename an id between runs, or the diff
breaks. Timing findings carry raw sample arrays under
`evidence.<cohort>.samples` (capped 200/cohort) so a reader can re-check the statistics.

## Markdown report

```
# Authentication Audit — <target> — <ISO timestamp>

Scope: <what was in scope, the caps used>
Environment: <runtime, OS, "local HTTP" etc>
Code reviewed: <paths / commit>

## Findings

### <id> — <one-line title>
- Verdict: CONFIRMED | SUSPECTED | INFORMATIONAL | NOT_DETECTED
- Severity: critical | high | medium | low | info   (CWE-xxx if known)
- What was observed: <plain statement, with the numbers>
- Evidence: <status codes / medians+p95 / effect size + p / response fragments — data, not adjectives>
- Why it matters: <the attack it enables, concretely>
- Exploitability: <what an attacker additionally needs>
- Remediation: <direction, aligned with auth-security-hardener's checklist>
- Limitations: <sample size, environment, what this does NOT prove>

## Summary
| id | verdict | severity | one-line |
```

For a re-run, add a `Change:` line to each finding (`fixed` / `still-present` /
`partially-addressed` / `regression`) and keep the previous numbers beside the new ones. The loop
computes these mechanically via `report.mjs::diffReports`.

A full worked example is in `../examples/sample-audit.md`.
