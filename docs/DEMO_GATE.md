# NFRP demo-readiness gate

A public revision is considered demo-ready only when the repository CI completes all of the following from a clean checkout:

1. public-boundary and sensitive-data validation;
2. CLI and smoke-test syntax checks;
3. ShellCheck at warning severity;
4. deterministic dependency installation with `npm ci`;
5. Prisma schema validation;
6. lint and unit tests;
7. production build;
8. Docker Compose model validation;
9. clean-room Docker installation;
10. authenticated login against the seeded synthetic environment.

The executable verification path is defined in `.github/workflows/ci.yml` and `scripts/ci_smoke.sh`. Operational claims in the README should remain no stronger than the latest successful run of this gate.
