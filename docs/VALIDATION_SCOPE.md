# Validation scope

This repository uses synthetic data and validates the public portfolio edition only. Production infrastructure, company data, operational credentials and private deployment configuration are outside the repository and outside the public CI scope.

CI verifies the public-data boundary, shell syntax, the non-interactive local quickstart contract, Prisma schema, lint, unit tests, production build, Docker Compose model and an empty-database installation with a real authenticated login and protected-route workflow checks. Windows/macOS compatibility is provided through Docker Desktop (WSL 2 on Windows), but CI itself runs on Linux; native host acceptance is therefore a separate release check.
