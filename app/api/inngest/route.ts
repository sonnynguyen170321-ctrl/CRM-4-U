import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { executeScheduledTask } from '@/lib/inngest/functions';

// Create API routes for Inngest communication
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    executeScheduledTask,
  ],
});
