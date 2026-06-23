import { enqueue } from '@/lib/bullmq/enqueue';
import { JobType, type EmailSendPayload } from '@/lib/bullmq';

/**
 * Enqueues an email sending job.
 */
export async function enqueueEmailSendWorkflow(
  payload: EmailSendPayload,
  tenantId: string
): Promise<string> {
  return enqueue(
    JobType.EMAIL_SEND,
    payload,
    { tenantId }
  );
}

/**
 * Enqueues an IMAP email inbox sync job.
 */
export async function enqueueEmailSyncWorkflow(
  accountId: string,
  tenantId: string
): Promise<string> {
  return enqueue(
    JobType.EMAIL_SYNC,
    { accountId },
    { tenantId }
  );
}
