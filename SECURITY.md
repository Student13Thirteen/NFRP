# Sicurezza

## Snapshot portfolio

Questa candidata e destinata a revisione tecnica locale. Non collegarla a database, storage o integrazioni operative e non caricare documenti reali.

## Controlli presenti

- sessione firmata HMAC con scadenza e cookie `HttpOnly`, `SameSite=Lax` e `Secure` in produzione;
- doppio controllo sulle aree protette: proxy e guardie server;
- API operative autenticate, salvo health check e ingestion separata con Bearer token;
- file fuori dalla directory pubblica, nomi casuali e controlli di traversal;
- password hash bcrypt;
- assistente limitato a strumenti read-only dichiarati.

## Limiti aperti

- un solo ruolo applicativo e nessun RBAC granulare;
- nessun rate limiting, lockout o protezione brute-force dedicata;
- nessuna revoca server-side o rotazione identificatore di sessione;
- nessun token CSRF esplicito o verifica `Origin` dedicata;
- header CSP, HSTS, frame, MIME sniffing, referrer e permissions da definire;
- multi-tenancy e audit autorizzativo non completi;
- dipendenze con advisory note al momento dell'handoff.

Segnalare problemi privatamente al maintainer del futuro repository. Non aprire issue pubbliche contenenti credenziali, documenti o dati personali.

## Company branding boundary

The company logo is intentionally available through a narrow public image endpoint so that it can appear on the login screen. Upload is authenticated, limited to PNG/JPG/WebP, capped at 2 MB and checked by file signature. Branding files live in the uploads volume and are not committed.

## Public repository rule

Run `python3 scripts/validate-public-repo.py` before every public release. It checks required demo files, common secret patterns, runtime directories, oversized files and database-port exposure.
