import { Inngest } from 'inngest';

// Initialize the Inngest client with a unique app identifier and local fallback key
export const inngest = new Inngest({ 
  id: 'telestar-crm',
  eventKey: process.env.INNGEST_EVENT_KEY || 'local_event_key',
  baseUrl: process.env.INNGEST_BASE_URL || (process.env.NODE_ENV !== 'production' ? 'http://localhost:8288' : undefined),
});
