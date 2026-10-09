# Repository workflow

- Follow CONTRIBUTING.md. Use .github/workflows/deploy.yml as the canonical lint, formatting, type, allowlisted-content generation, build, internal-link, and external-link gates.
- Branch pushes, PRs, scheduled content checks, and content-update dispatches validate the site. Production publication requires an authorized manual dispatch from main and human approval in the protected github-pages environment.
- Playbook publication is a separate manual operation. Preserve its baseline run, artifact identity, SHA-256 requirements, and protected production environment.
- Preserve publication/decision-continuity.json's exact source pin; source development does not authorize updating the public demonstration.
