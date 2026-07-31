# NFRP Portfolio Edition - contesto applicativo

## Scopo

NFRP e un modular monolith per processi operativi di una PMI di trasporto. Questa Portfolio Edition mantiene architettura, workflow e test significativi, ma usa solo configurazione e dati sintetici. Il database web resta la fonte di verita; importazioni e OCR producono proposte revisionabili.

## Stack

- Next.js 16 App Router, React 19, TypeScript strict;
- Prisma 5 e PostgreSQL 16;
- sessione HMAC in cookie `HttpOnly`, `SameSite=Lax`;
- Docker Compose per app e database;
- OCR locale tramite OCRmyPDF, Tesseract, pikepdf, Ghostscript e Pillow quando installati;
- Ollama opzionale per l'assistente read-only.

## Regole funzionali

- le route operative richiedono autenticazione sia nel proxy sia nel codice server;
- i file sono conservati fuori da `public/` e serviti solo da route autenticate;
- importazioni economiche e risultati OCR restano `PENDING` fino alla conferma umana;
- chiavi di origine, hash e vincoli Prisma riducono le duplicazioni;
- il centro costi esclude bozze e righe non contabilizzate;
- i viaggi di distribuzione carburante e i viaggi container sono domini distinti;
- l'assistente usa una whitelist di query Prisma read-only e non esegue SQL libero.

## Moduli

Anagrafiche e flotta, archivio documenti, inbox OCR, viaggi, carburanti, pedaggi, manutenzioni e spese, leasing, magazzino, centro costi, notifiche, mirror documentale e assistente locale. Alcune integrazioni sono volutamente disattivate nel profilo demo.

## Avvio e sicurezza

Usare esclusivamente un database isolato creato dal Compose di questa directory. Copiare `.env.example` in `.env`, cambiare le credenziali prima di qualsiasi esposizione e non importare documenti reali nella demo pubblica. Le limitazioni note sono elencate in `SECURITY.md`.

## Verifica nota della candidata

La verifica di consegna deve comprendere `npm run lint`, `npm run test`, `npm run build`, `prisma validate` e `docker compose config --quiet`. Il risultato puntuale appartiene al report tecnico esterno alla candidata, non a questo file.
