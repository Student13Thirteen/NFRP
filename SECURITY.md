# Security

## Portfolio snapshot

This public edition is intended for local technical review. Do not connect it to operational databases, storage systems or integrations, and do not upload real documents.

## Existing controls

- HMAC-signed sessions with expiration and `HttpOnly`, `SameSite=Lax` cookies, plus `Secure` cookies in HTTPS deployments;
- two-layer protection for restricted areas through the application proxy and server-side guards;
- authenticated operational APIs, except for the public health endpoint and the separate ingestion endpoint protected by a Bearer token;
- uploaded files stored outside the public directory, with randomized names and path-traversal checks;
- bcrypt password hashing;
- assistant functionality restricted to explicitly declared read-only tools.

## Known limitations

- a single application role and no granular RBAC;
- no dedicated rate limiting, account lockout or brute-force protection;
- no server-side session revocation or session identifier rotation;
- no explicit CSRF token or dedicated `Origin` verification;
- CSP, HSTS, frame, MIME-sniffing, referrer and permissions headers still require a complete production policy;
- multi-tenancy and authorization auditing are not complete.

Report security issues privately to the repository maintainer. Do not open public issues containing credentials, documents, personal data or exploitable details.

## Company branding boundary

The company logo is intentionally available through a narrow public image endpoint so that it can appear on the login screen. Upload is authenticated, limited to PNG, JPG or WebP, capped at 2 MB and checked by file signature. Branding files live in the uploads volume and are not committed.

## Public repository rule

Run `python3 scripts/validate-public-repo.py` before every public release. It checks required demo files, common secret patterns, runtime directories, oversized files and database-port exposure.
