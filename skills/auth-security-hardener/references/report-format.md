# Hardening-report format

```
# Authentication Hardening — <code> — <ISO timestamp>

Reviewed against: auth-security-hardener references/checklist.md.
Input findings: <breaker findings.json path or "none">.
Boundaries: <files/functions for authn and authz>

## Items

### <checklist item>
- Status: present / absent / partial  (<file:line>)
- Why it matters: <one concrete attack>
- Decision: FIX | RECOMMEND | SKIP  — <reason>
- Change: <files touched, one line each>       (FIX only)
- Test: <test name/path that fails-before / passes-after>   (FIX only)
- Residual risk: <what still could go wrong / what this does not cover>

## Re-review
<checklist walked again; each FIX confirmed closed; anything newly exposed>

## Summary
| item | decision | test |
```

Every FIX carries a residual-risk line. Nothing is described as "now secure". The full worked
example is in `../examples/hardening-report.md`.
