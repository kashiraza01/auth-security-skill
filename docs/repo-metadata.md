# GitHub repository metadata

Settings that live in GitHub rather than in the repo. Set these once, in
**Settings → General** and the **About** panel on the repository home page.

## Description

Paste into the About panel (350 character limit; this is 236):

```
Two Claude Code skills for authentication security: one audits an auth implementation for user enumeration, timing attacks, token forgery and broken authorization, the other hardens it. Runnable MERN demo with paired vulnerable and hardened stacks.
```

## Website

Point it at the live demo once it is deployed. Until then, leave it empty rather than
linking to localhost.

## Topics

GitHub allows 20. These are ordered by how likely someone is to search them:

```
claude-code  claude-code-skills  ai-coding-agent  authentication  authentication-security
application-security  appsec  security-testing  secure-coding  user-enumeration
timing-attack  jwt  jwt-security  authorization  mern  nodejs  express  nextjs  mongodb  owasp
```

## Social preview image

Settings → General → Social preview. A 1280×640 PNG. `media/lab-overview.png` is the right
shot; crop it to 1280×640 rather than letting GitHub letterbox the full 1487×1039.

## Repository settings worth turning on

- **Issues** — on. The contributing guide points people there.
- **Private vulnerability reporting** — on (Settings → Code security). `CONTRIBUTING.md`
  tells contributors to use a private advisory for real vulnerabilities in this code, which
  only works if this is enabled.
- **Discussions** — optional. Useful if people start proposing new checks.
