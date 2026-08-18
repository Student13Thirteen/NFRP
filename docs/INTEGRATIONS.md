# Optional integrations

Install and verify the base application first:

```bash
bash nfrp doctor
```

Then edit `.env`, enable only the integration you need and run:

```bash
bash nfrp start
```

The CLI automatically starts the matching Docker Compose profile. Never commit `.env`, passwords or tokens.

## Nextcloud document mirror

Create a dedicated Nextcloud app password, then set:

```dotenv
DOCUMENT_MIRROR_ENABLED=true
DOCUMENT_MIRROR_NEXTCLOUD_BASE_URL=https://cloud.example.com
DOCUMENT_MIRROR_NEXTCLOUD_USER=demo-user
DOCUMENT_MIRROR_NEXTCLOUD_PASS=replace-with-an-app-password
DOCUMENT_MIRROR_NEXTCLOUD_FOLDER=NFRP Documents
```

Start and inspect the worker:

```bash
bash nfrp start
bash nfrp logs document-mirror
```

Behavior:

- every new managed PDF is queued after the application transaction succeeds;
- edits that change its destination move or upload the remote file;
- deleted application documents remove their mirrored copy;
- files are organized by active/history boundary, entity kind and entity name;
- sold or scrapped vehicles use a separate old-vehicle area;
- failed jobs retry with backoff and interrupted jobs recover after restart.

The history folder is based on application state (`ARCHIVED` or `RENEWED`), not on the calendar alone. A document becoming past its expiry date does not silently change business state or move folders until the application archives or renews it.

Enabling the mirror affects new changes. Existing documents are not automatically backfilled by the public setup command.

## Telegram expiry notifications

Create a bot, obtain the intended chat IDs and set:

```dotenv
TELEGRAM_NOTIFICATIONS_ENABLED=true
TELEGRAM_BOT_TOKEN=replace-with-the-bot-token
TELEGRAM_CHAT_IDS=123456789,987654321
NOTIFICATION_CRON=0 8 * * *
NOTIFICATION_TIMEZONE=Europe/Rome
```

Then run:

```bash
bash nfrp start
bash nfrp logs notifications
```

The default schedule is 08:00 in the configured timezone. Notification delivery retries are controlled by the `NOTIFICATION_*` and `TELEGRAM_SEND_*` variables already present in `.env`.

## Local read-only assistant with Ollama

Set:

```dotenv
ASSISTANT_ENABLED=true
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=qwen3:1.7b
```

Start the assistant service and download the selected model once:

```bash
bash nfrp start
docker compose --profile assistant exec ollama ollama pull qwen3:1.7b
```

The NFRP Bot is deliberately limited to declared read-only tools. Treat model output as a navigation and retrieval aid, not as an autonomous accounting action.

## Cloudflare Tunnel

The guided setup can configure this mode. In Cloudflare, route the public hostname to:

```text
http://app:3000
```

The tunnel token remains in `.env`; the Cloudflare container is started only for the remote deployment mode. Review firewall, access policy and the limits in [SECURITY.md](../SECURITY.md) before exposing an installation with real data.
