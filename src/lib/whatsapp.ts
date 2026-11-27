import { listTeamMembers, recordWhatsAppLog } from './repository.ts';
import type { TaskRow } from './types.ts';

export function isTwilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_WHATSAPP_FROM
  );
}

export async function sendWhatsAppMessage(params: {
  toPhone: string;
  memberId: string | null;
  body: string;
  relatedTaskId?: string | null;
  idempotencyKey?: string;
}) {
  let providerStatus = 'simulated';

  if (isTwilioConfigured()) {
    try {
      const sid = process.env.TWILIO_ACCOUNT_SID!;
      const token = process.env.TWILIO_AUTH_TOKEN!;
      const from = process.env.TWILIO_WHATSAPP_FROM!;
      const to = params.toPhone.startsWith('whatsapp:')
        ? params.toPhone
        : `whatsapp:${params.toPhone}`;
      const fromFormatted = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`;

      const form = new URLSearchParams({
        To: to,
        From: fromFormatted,
        Body: params.body,
      });

      const resp = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form.toString(),
          signal: AbortSignal.timeout(8000),
        }
      );
      providerStatus = resp.ok ? 'twilio_sent' : `twilio_err_${resp.status}`;
    } catch {
      providerStatus = 'twilio_error';
    }
  }

  return recordWhatsAppLog({
    direction: 'outbound',
    member_id: params.memberId,
    phone_e164: params.toPhone,
    message_body: params.body,
    related_task_id: params.relatedTaskId ?? null,
    provider_status: providerStatus,
    idempotency_key: params.idempotencyKey,
  });
}

export async function notifyAssigneeForTask(task: TaskRow) {
  const members = await listTeamMembers();
  const member = members.find(
    (m) => m.full_name.toLowerCase() === task.owner_name.toLowerCase()
  );
  if (!member) return null;

  const dueStr = task.due_date ? ` (Due: ${task.due_date})` : '';
  const body = `[CampusFest Task · ${(task.priority ?? 'p1').toUpperCase()}] Hi ${member.full_name}, assigned to you: "${task.title}"${dueStr}. Reply here with questions about your tasks or targets.`;

  return sendWhatsAppMessage({
    toPhone: member.phone_e164,
    memberId: member.member_id,
    body,
    relatedTaskId: task.id,
    idempotencyKey: `wa_task_${task.id}`,
  });
}
