/**
 * YOUSIVAR chat engine.
 *
 * Provider-agnostic surface: the client sends a model key from the registry plus
 * bounded conversation state; this function validates everything, signs only
 * app-owned documents, calls the platform LLM integration and writes an audit
 * record. Secrets never reach the browser.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import {
  MODEL_REGISTRY, DEFAULT_MODEL, MAX_MEMORY_ITEMS, MAX_TOTAL_CHARS,
  cleanMessages, totalChars, safeDocumentUris, modelCaps, buildPrompt,
} from '../../shared/models.ts';

async function signDocuments(base44, uris) {
  const signed = [];
  for (const uri of uris) {
    try {
      const res = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
        file_uri: uri,
        expires_in: 900,
      });
      if (res && res.signed_url) signed.push(res.signed_url);
    } catch {
      // A document that cannot be signed is skipped; the conversation continues.
    }
  }
  return signed;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const model = typeof body.model === 'string' ? body.model : DEFAULT_MODEL;
    if (!MODEL_REGISTRY[model]) {
      return Response.json({ error: 'Unknown model' }, { status: 400 });
    }

    const messages = cleanMessages(body.messages);
    if (!messages.length) return Response.json({ error: 'messages is required' }, { status: 400 });
    if (totalChars(messages) > MAX_TOTAL_CHARS) {
      return Response.json({ error: 'Conversation too long' }, { status: 400 });
    }

    const language = body.language === 'ar' ? 'ar' : 'en';
    const caps = modelCaps(model);

    const memories = Array.isArray(body.memories)
      ? body.memories.slice(0, MAX_MEMORY_ITEMS)
          .map((m) => String(m || '').trim().slice(0, 300))
          .filter(Boolean)
      : [];

    const documentUris = safeDocumentUris(body.documentUris);
    if (documentUris.length && !caps.supports_documents) {
      return Response.json({ error: 'This model does not accept documents' }, { status: 400 });
    }

    const documentNames = Array.isArray(body.documentNames)
      ? body.documentNames.slice(0, documentUris.length).map((n) => String(n || '').slice(0, 120))
      : [];

    const fileUrls = await signDocuments(base44, documentUris);
    const prompt = buildPrompt({ messages, memories, documentNames, language });

    const payload = { prompt };
    if (model !== 'automatic') payload.model = model;
    if (fileUrls.length) payload.file_urls = fileUrls;
    if (caps.supports_web_search && body.webSearch === true) payload.add_context_from_internet = true;

    const started = Date.now();
    const result = await base44.asServiceRole.integrations.Core.InvokeLLM(payload);
    const latency = Date.now() - started;

    const content = typeof result === 'string' ? result : JSON.stringify(result);

    await base44.entities.AuditLog.create({
      action: 'chat.completion',
      actor_email: user.email || '',
      model,
      latency_ms: latency,
      chars: content.length,
      detail: `memories:${memories.length} documents:${documentUris.length} web:${payload.add_context_from_internet === true}`,
    }).catch(() => {});

    // The platform integration returns a finished reply, so the stream carries one
    // honest frame rather than a simulated typewriter.
    if (body.stream === true) {
      const encoder = new TextEncoder();
      const frame = (payload) => encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(frame({ delta: content }));
          controller.enqueue(frame({
            done: true,
            content,
            model,
            latency_ms: latency,
            chars: content.length,
            documents_used: fileUrls.length,
            web_grounded: payload.add_context_from_internet === true,
          }));
          controller.close();
        },
      });
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no',
        },
      });
    }

    return Response.json({
      content,
      model,
      latency_ms: latency,
      chars: content.length,
      documents_used: fileUrls.length,
      web_grounded: payload.add_context_from_internet === true,
    });
  } catch (error) {
    return Response.json({ error: error.message || 'Model request failed' }, { status: 500 });
  }
}