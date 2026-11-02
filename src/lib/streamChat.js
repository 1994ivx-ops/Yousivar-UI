import { base44 } from '@/api/base44Client';
import { isProviderModel } from '@/lib/ai';

/**
 * Sends one turn and hands the answer to the caller.
 *
 * Transport truth: the platform invokes backend functions with a buffered JSON
 * response, so the browser receives a finished answer rather than live tokens.
 * The server side does expose a real SSE endpoint (providerChat with
 * `stream: true`) for clients that can consume a chunked body — the web client
 * therefore renders the answer the moment it arrives and never replays it with
 * a timer.
 */
export async function streamCompletion(payload, { onDelta } = {}) {
  const fn = isProviderModel(payload.model) ? 'providerChat' : 'chatCompletion';
  const res = await base44.functions.invoke(fn, payload);
  const data = res?.data || {};
  if (data.error) throw new Error(data.error);

  const content = typeof data.content === 'string' ? data.content : '';
  if (content) onDelta?.(content);
  return data;
}