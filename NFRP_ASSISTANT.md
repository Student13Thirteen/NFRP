# Assistente locale NFRP

L'assistente opzionale usa Ollama come planner locale e un catalogo chiuso di strumenti applicativi. Gli strumenti leggono dati tramite Prisma e restituiscono riepiloghi; non eseguono SQL libero e non includono comandi di creazione, modifica, conferma o cancellazione.

Il profilo demo parte con `ASSISTANT_ENABLED=false`. Per una dimostrazione isolata occorre avviare il profilo Compose `assistant`, scaricare separatamente un modello compatibile e abilitare la variabile. Prompt e risultati possono contenere dati caricati nell'ambiente: usare esclusivamente il dataset sintetico.

Limiti da risolvere prima di un uso pubblico: rate limiting, quote, autorizzazione granulare per strumento, policy di retention dei prompt e test di prompt injection. L'autenticazione alla route non sostituisce questi controlli.
