# Visione NFRP Portfolio Edition

## Direzione

Una sola codebase evolve da verticale trasporti a piattaforma ERP modulare. Il core fornisce identita, accesso, audit, documenti, notifiche, ricerca, workflow, reporting e impostazioni. I moduli di dominio contribuiscono route, permessi, eventi, parser e report senza duplicare shell o design system.

```text
core ERP
+ moduli installabili
+ vertical pack curato
+ configurazione tenant
= prodotto coerente per il settore
```

L'architettura iniziale resta un modular monolith: confini interni chiari, database relazionale e un solo deploy. Microservizi e caricamento di codice terzo non attendibile sono fuori dallo scope iniziale.

## Document intelligence

La pipeline comune e: acquisizione, separazione, classificazione, estrazione, punteggio di confidenza, revisione, validazione, commit e audit. OCR e AI propongono; la validazione applicativa e l'operatore decidono. I moduli registrano schema di estrazione, validatori e adapter di commit.

## Multi-tenancy e moduli

Prima di presentare la piattaforma come SaaS multi-azienda servono query tenant-safe, RBAC granulare, audit completo, migrazioni compatibili, backup/restore verificato e contratti di modulo versionati. I moduli iniziali sono pacchetti first-party affidabili e abilitati per configurazione.

## UX e distribuzione

La web app e la fonte di verita. PWA installabile e responsive viene prima di un eventuale wrapper desktop. L'offline deve iniziare da letture in cache o code di upload delimitate, non da mutazioni ERP generalizzate senza un disegno di conflitto e audit.

## Confine pubblico

La Portfolio Edition deve usare solo dati demo sintetici, integrazioni disattivate e documentazione priva di riferimenti operativi. Licenza e confine open-core sono decisioni legali e di prodotto ancora esplicite; non vanno dedotti dalla presenza del sorgente.
