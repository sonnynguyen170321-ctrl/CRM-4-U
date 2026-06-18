import Groq from 'groq-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AI_TOOLS, executeTool } from './tools';

export type ModelId =
  | 'llama-3.3-70b-versatile'    // ⚡ Smart & Balanced
  | 'llama-3.1-8b-instant'        // 🚀 Ultra Fast
  | 'gemma2-9b-it'                // ✍️ Email & Writing
  | 'gemini-2.0-flash';           // 🎨 Creative & Polished

export const MODEL_LABELS: Record<ModelId, string> = {
  'llama-3.3-70b-versatile': '⚡ Smart & Balanced',
  'llama-3.1-8b-instant': '🚀 Ultra Fast',
  'gemma2-9b-it': '✍️ Email & Writing',
  'gemini-2.0-flash': '🎨 Creative & Polished',
};

export const MODEL_DESCRIPTIONS: Record<ModelId, string> = {
  'llama-3.3-70b-versatile':
    'Best overall quality. Use for coaching, objection handling, research, and morning briefings.',
  'llama-3.1-8b-instant':
    'Replies in under 1 second. Best for quick questions and creating tasks on the fly.',
  'gemma2-9b-it':
    'Great at following instructions. Best for writing cold emails and LinkedIn messages.',
  'gemini-2.0-flash':
    'Google\'s latest model. Best for creative writing, subject lines, and brainstorming.',
};

export const DEFAULT_MODEL: ModelId = 'llama-3.3-70b-versatile';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface StreamOptions {
  messages: ChatMessage[];
  systemPrompt: string;
  modelId: ModelId;
  userId: string;
  leadId?: string;
  today: string;
}

// Unified streaming interface — returns an async generator of text chunks
export async function* streamChat(opts: StreamOptions): AsyncGenerator<string> {
  const { modelId } = opts;

  if (modelId === 'gemini-2.0-flash') {
    yield* streamGemini(opts);
  } else {
    yield* streamGroq(opts);
  }
}

async function* streamGroq(opts: StreamOptions): AsyncGenerator<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    yield 'GROQ_API_KEY is not configured. Please add it to your .env.local file.';
    return;
  }

  const groq = new Groq({ apiKey });

  // Use Groq's own message param type so tool/assistant messages are accepted
  type GMsg = Parameters<typeof groq.chat.completions.create>[0]['messages'][number];
  const loopMessages: GMsg[] = [
    { role: 'system' as const, content: opts.systemPrompt } as GMsg,
    ...opts.messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content } as GMsg)),
  ];

  // Tool calling loop — Groq may call a tool before giving the final answer
  let iterations = 0;
  const MAX_TOOL_ITERATIONS = 3;

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++;

    let response: Awaited<ReturnType<typeof groq.chat.completions.create>>;
    try {
      response = await groq.chat.completions.create({
        model: opts.modelId,
        messages: loopMessages,
        tools: AI_TOOLS as Parameters<typeof groq.chat.completions.create>[0]['tools'],
        tool_choice: 'auto',
        max_tokens: 800,
        stream: false,
      });
    } catch (err: unknown) {
      // Groq rejects malformed tool calls (old XML format from some model versions).
      // Retry once without tools to get a plain-text response.
      const isToolError =
        err instanceof Error &&
        (err.message.includes('tool_use_failed') || err.message.includes('tool call validation'));
      if (isToolError) {
        const fallback = await groq.chat.completions.create({
          model: opts.modelId,
          messages: loopMessages,
          max_tokens: 800,
          stream: false,
        });
        const content = fallback.choices[0]?.message?.content || '';
        const words = content.split(' ');
        for (let i = 0; i < words.length; i += 3) {
          yield words.slice(i, i + 3).join(' ') + (i + 3 < words.length ? ' ' : '');
        }
        return;
      }
      throw err;
    }

    const choice = response.choices[0];

    if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
      // Execute tool calls
      loopMessages.push({
        role: 'assistant',
        content: choice.message.content || '',
        tool_calls: choice.message.tool_calls,
      } as Parameters<typeof groq.chat.completions.create>[0]['messages'][number]);

      for (const toolCall of choice.message.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments || '{}');
        const result = await executeTool(toolCall.function.name, args, {
          userId: opts.userId,
          leadId: opts.leadId,
          today: opts.today,
        });

        loopMessages.push({
          role: 'tool' as const,
          tool_call_id: toolCall.id,
          content: result,
        } as Parameters<typeof groq.chat.completions.create>[0]['messages'][number]);
      }
      // Continue the loop to get the final response
      continue;
    }

    // Final answer — stream it
    const finalContent = choice.message.content || '';
    // Simulate streaming by yielding in chunks
    const words = finalContent.split(' ');
    for (let i = 0; i < words.length; i += 3) {
      yield words.slice(i, i + 3).join(' ') + (i + 3 < words.length ? ' ' : '');
    }
    return;
  }
}

async function* streamGemini(opts: StreamOptions): AsyncGenerator<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    yield 'GEMINI_API_KEY is not configured. Please add it to your .env.local file.';
    return;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

  // Build Gemini chat history (excluding the last user message)
  const history = opts.messages.slice(0, -1).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const lastMessage = opts.messages[opts.messages.length - 1];
  const chat = model.startChat({
    history,
    systemInstruction: opts.systemPrompt,
  });

  const result = await chat.sendMessageStream(lastMessage.content);
  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) yield text;
  }
}
