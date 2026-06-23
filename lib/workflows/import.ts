import { enqueue } from '@/lib/bullmq/enqueue';
import { JobType } from '@/lib/bullmq/types';

/**
 * Starts the CSV import workflow by enqueuing the initial CSV parse job.
 * Once parsed, this job dynamically chunks and commits the rows.
 */
export async function startImportWorkflow(batchId: string, tenantId: string): Promise<string> {
  return enqueue(
    JobType.IMPORT_PARSE,
    { batchId },
    { tenantId }
  );
}
