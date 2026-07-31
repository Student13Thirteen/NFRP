# NFRP Portfolio Edition vision

## Direction

A single codebase can evolve from a transport vertical into a modular ERP platform. The core provides identity, access control, audit, documents, notifications, search, workflows, reporting and settings. Domain modules contribute routes, permissions, events, parsers and reports without duplicating the application shell or design system.

```text
ERP core
+ installable modules
+ curated vertical pack
+ tenant configuration
= coherent product for the sector
```

The initial architecture remains a modular monolith: clear internal boundaries, a relational database and a single deployment unit. Microservices and the loading of untrusted third-party code are outside the initial scope.

## Document intelligence

The shared pipeline is acquisition, separation, classification, extraction, confidence scoring, review, validation, commit and audit. OCR and AI propose; application validation and the operator decide. Modules register extraction schemas, validators and commit adapters.

## Multi-tenancy and modules

Before presenting the platform as a multi-company SaaS, it would require tenant-safe queries, granular RBAC, complete auditing, compatible migrations, verified backup and restore procedures, and versioned module contracts. Initial modules should remain trusted first-party packages enabled through configuration.

## UX and distribution

The web application remains the source of truth. An installable, responsive PWA should come before any desktop wrapper. Offline support should begin with cached reads or bounded upload queues, not generalized ERP mutations without a deliberate conflict-resolution and audit model.

## Public boundary

The Portfolio Edition must use only synthetic demo data, disabled operational integrations and documentation free of operational references. Licensing and any open-core boundary remain explicit legal and product decisions; neither should be inferred from the availability of the source code.
