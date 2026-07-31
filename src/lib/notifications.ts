import { DocumentStatus, NotificationChannel, NotificationType } from '@prisma/client';
import { prisma } from '@/lib/db';
import { daysUntil, formatDate } from '@/lib/dates';
import { documentInclude, getDocumentRuntimeStatus, getEntityLabel } from '@/lib/documents';
import { buildDocumentUrl, sendTelegramNotification } from '@/lib/telegram';
import { getOperationalFleetDocumentWhere } from '@/lib/vehicle-lifecycle';

export async function runExpirationNotificationJob(now = new Date()) {
  const documents = await prisma.document.findMany({
    where: {
      AND: [
        { status: { notIn: [DocumentStatus.ARCHIVED, DocumentStatus.RENEWED] } },
        getOperationalFleetDocumentWhere()
      ]
    },
    include: documentInclude,
    orderBy: { expiryDate: 'asc' }
  });

  let scanned = 0;
  let sent = 0;
  let failed = 0;

  for (const document of documents) {
    scanned += 1;
    const remaining = daysUntil(document.expiryDate, now);
    const runtimeStatus = getDocumentRuntimeStatus(document);

    if (runtimeStatus !== document.status) {
      await prisma.document.update({
        where: { id: document.id },
        data: { status: runtimeStatus }
      });
    }

    const shouldNotify = remaining < 0 || (remaining >= 0 && remaining <= document.noticeDays);
    if (!shouldNotify) {
      continue;
    }

    const todayKey = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().slice(0, 10);
    const dedupeKey = `${document.id}:${NotificationType.NOTICE}:${NotificationChannel.TELEGRAM}:${todayKey}`;
    const alreadySent = await prisma.notificationLog.findUnique({ where: { dedupeKey } });
    if (alreadySent?.success) continue;

    const icon = remaining < 0 ? '🚨 Documento scaduto' : '⚠️ Documento in scadenza';
    const message = [
      icon,
      '',
      `Documento: ${document.title}`,
      `Tipo: ${document.documentType.name}`,
      `Associato a: ${getEntityLabel(document)}`,
      `Scadenza: ${formatDate(document.expiryDate)}`,
      `Giorni mancanti: ${remaining}`,
      '',
      'Apri scheda:',
      buildDocumentUrl(document.id)
    ].join('\n');

    const results = await sendTelegramNotification(message);
    const success = results.some((result) => result.ok);
    const error = results
      .filter((result) => !result.ok)
      .map((result) => `${result.chatId || 'config'}: ${result.error}`)
      .join(' | ');

    await prisma.notificationLog.upsert({
      where: { dedupeKey },
      update: {
        sentAt: new Date(),
        success,
        error: error || null
      },
      create: {
        documentId: document.id,
        type: NotificationType.NOTICE,
        channel: NotificationChannel.TELEGRAM,
        success,
        error: error || null,
        dedupeKey
      }
    });

    if (success) sent += 1;
    else failed += 1;
  }

  return { scanned, sent, failed };
}
