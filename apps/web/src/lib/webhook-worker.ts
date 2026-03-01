/**
 * Webhook delivery worker: processes PENDING OutboxEvents and RETRYING attempts.
 */
import { prisma } from "./db";
import { deliverWebhook, getNextRetryAt, shouldRetry } from "./webhook-deliver";

export async function processWebhookDelivery(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  retrying: number;
}> {
  const now = new Date();
  const pending = await prisma.outboxEvent.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  const dueRetries = await prisma.webhookDeliveryAttempt.findMany({
    where: { status: "RETRYING", nextAttemptAt: { lte: now } },
    take: 30,
    include: { endpoint: true, outboxEvent: true },
  });

  let succeeded = 0;
  let failed = 0;
  let retrying = 0;

  for (const attempt of dueRetries) {
    const event = attempt.outboxEvent;
    const endpoint = attempt.endpoint;
    const attemptNum = attempt.attemptNumber + 1;
    const payload = { version: 1, data: event.payload };
    const result = await deliverWebhook(endpoint.url, event.id, event.type, payload, endpoint.secret);
    const nextAt = getNextRetryAt(attemptNum);
    const willRetry = shouldRetry(result.status, attemptNum);
    let status: string;
    if (result.status >= 200 && result.status < 300) {
      status = "SUCCESS";
      succeeded++;
    } else if (willRetry && nextAt) {
      status = "RETRYING";
      retrying++;
    } else {
      status = "DEAD";
      failed++;
    }
    await prisma.webhookDeliveryAttempt.create({
      data: {
        orgId: event.orgId,
        endpointId: endpoint.id,
        outboxEventId: event.id,
        attemptNumber: attemptNum,
        status,
        requestHeaders: { "X-KharchaPay-Event-Id": event.id, "X-KharchaPay-Event-Type": event.type },
        requestBody: payload,
        responseStatus: result.status || undefined,
        responseBodySnippet: result.bodySnippet || undefined,
        errorMessage: result.error,
        nextAttemptAt: willRetry ? nextAt : null,
        completedAt: status !== "RETRYING" ? now : null,
      },
    });
    if (status === "SUCCESS") {
      await prisma.webhookEndpoint.update({
        where: { id: endpoint.id },
        data: { lastDeliveryAt: now, updatedAt: now },
      });
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: "DELIVERED" },
      });
    }
  }

  for (const event of pending) {
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { orgId: event.orgId, status: "ACTIVE" },
    });

    const subscribed = endpoints.filter((e) => {
      const types = (e.subscribedEventTypes as string[]) ?? [];
      return types.includes(event.type) || types.includes("*");
    });

    for (const endpoint of subscribed) {
      const existing = await prisma.webhookDeliveryAttempt.findFirst({
        where: { endpointId: endpoint.id, outboxEventId: event.id },
        orderBy: { attemptNumber: "desc" },
      });
      const attemptNum = (existing?.attemptNumber ?? 0) + 1;

      if (existing?.status === "SUCCESS") continue;
      if (existing?.status === "DEAD") continue;
      if (existing?.nextAttemptAt && existing.nextAttemptAt > new Date()) continue;

      const payload = { version: 1, data: event.payload };
      const result = await deliverWebhook(
        endpoint.url,
        event.id,
        event.type,
        payload,
        endpoint.secret
      );

      const now = new Date();
      const nextAt = getNextRetryAt(attemptNum);
      const willRetry = shouldRetry(result.status, attemptNum);

      let status: string;
      if (result.status >= 200 && result.status < 300) {
        status = "SUCCESS";
        succeeded++;
      } else if (willRetry && nextAt) {
        status = "RETRYING";
        retrying++;
      } else {
        status = "DEAD";
        failed++;
      }

      await prisma.webhookDeliveryAttempt.create({
        data: {
          orgId: event.orgId,
          endpointId: endpoint.id,
          outboxEventId: event.id,
          attemptNumber: attemptNum,
          status,
          requestHeaders: { "X-KharchaPay-Event-Id": event.id, "X-KharchaPay-Event-Type": event.type },
          requestBody: payload,
          responseStatus: result.status || undefined,
          responseBodySnippet: result.bodySnippet || undefined,
          errorMessage: result.error,
          nextAttemptAt: willRetry ? nextAt : null,
          completedAt: status !== "RETRYING" ? now : null,
        },
      });

      if (status === "SUCCESS") {
        await prisma.webhookEndpoint.update({
          where: { id: endpoint.id },
          data: { lastDeliveryAt: now, updatedAt: now },
        });
      }
    }

    const anyDelivered = subscribed.length > 0;
    const anySuccess = await prisma.webhookDeliveryAttempt.findFirst({
      where: { outboxEventId: event.id, status: "SUCCESS" },
    });
    if (anyDelivered && anySuccess) {
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: "DELIVERED" },
      });
    }
  }

  return { processed: pending.length, succeeded, failed, retrying };
}
