import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMITS, cleanMessages, withinCharBudget, buildSystem, cleanMemories, cleanDocumentNames,
  pickCandidates, modelForCandidate, pickSearchAccount, resolveRoute, servicesForRegistryModel,
} from '../src/services/chat.js';

const account = (service, extra = {}) => ({
  service, enabled: true, default_model: `${service}-default`, models_cache: [], priority: 100, ...extra,
});

test('message cleaning keeps the tail, normalises roles and drops empties', () => {
  const raw = Array.from({ length: 60 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `m${index}` }));
  const cleaned = cleanMessages(raw);
  assert.equal(cleaned.length, LIMITS.maxMessages);
  assert.equal(cleaned[0].content, 'm20');
  assert.deepEqual(cleanMessages([{ role: 'system', content: 'x' }])[0].role, 'user');
  assert.equal(cleanMessages([{ role: 'user', content: '   ' }]).length, 0);
  assert.deepEqual(cleanMessages('nope'), []);
});

test('message bodies are truncated to the per-message cap', () => {
  const [message] = cleanMessages([{ role: 'user', content: 'a'.repeat(20000) }]);
  assert.equal(message.content.length, LIMITS.maxMessageChars);
});

test('the character budget is enforced across the whole conversation', () => {
  assert.equal(withinCharBudget([{ content: 'a'.repeat(100) }]), true);
  assert.equal(withinCharBudget([{ content: 'a'.repeat(LIMITS.maxChars + 1) }]), false);
});

test('memories and document names are bounded', () => {
  assert.equal(cleanMemories(Array.from({ length: 50 }, (_, i) => `m${i}`)).length, LIMITS.maxMemory);
  assert.equal(cleanMemories(['x'.repeat(900)])[0].length, 300);
  assert.equal(cleanDocumentNames(Array.from({ length: 10 }, (_, i) => `d${i}`)).length, 4);
  assert.deepEqual(cleanMemories(null), []);
});

test('the system prompt keeps its identity, language rule and grounding blocks', () => {
  const plain = buildSystem({ language: 'en' });
  assert.match(plain, /You are YOUSIVAR/);
  assert.match(plain, /Answer in the language the user writes in/);

  const arabic = buildSystem({ language: 'ar' });
  assert.match(arabic, /Modern Standard Arabic/);

  const grounded = buildSystem({
    language: 'en',
    memories: ['prefers metric units'],
    documentNames: ['contract.pdf'],
    search: { provider: 'Tavily', hits: [{ title: 'T', url: 'https://x.test', snippet: 'S' }], answer: 'A' },
  });
  assert.match(grounded, /prefers metric units/);
  assert.match(grounded, /contract\.pdf/);
  assert.match(grounded, /\[1\] T — https:\/\/x\.test/);
  assert.match(grounded, /Provider summary: A/);
});

test('candidates put the requested service first and cap the fallback chain', () => {
  const rows = [account('anthropic'), account('openrouter'), account('groq'), account('gemini'), account('tavily')];
  const picked = pickCandidates(rows, 'groq');
  assert.equal(picked[0].service, 'groq');
  assert.equal(picked.length, 3);
  assert.ok(!picked.some((row) => row.service === 'tavily')); // search-only, never a chat fallback
});

test('disabled accounts are excluded from routing', () => {
  const picked = pickCandidates([account('groq', { enabled: false }), account('anthropic')], 'groq');
  assert.deepEqual(picked.map((row) => row.service), ['anthropic']);
});

test('the requested service keeps the requested model, fallbacks use their own default', () => {
  const requested = account('groq');
  assert.equal(modelForCandidate(requested, 'groq', 'llama-3.3-70b'), 'llama-3.3-70b');
  assert.equal(modelForCandidate(requested, 'anthropic', 'llama-3.3-70b'), 'groq-default');
});

test('search grounding only picks a ready search account', () => {
  const rows = [account('tavily'), account('exa')];
  const isReady = (def) => def.id === 'exa';
  const picked = pickSearchAccount(rows, isReady);
  assert.equal(picked.account.service, 'exa');
  assert.equal(pickSearchAccount(rows, () => false), null);
});

test('a "<service>::<model>" key routes straight to that provider', () => {
  const route = resolveRoute({ modelKey: 'anthropic::claude-sonnet-5', rows: [account('anthropic')] });
  assert.equal(route.serviceId, 'anthropic');
  assert.equal(route.modelId, 'claude-sonnet-5');
  assert.equal(route.candidates.length, 1);
});

test('an unknown provider is an error, never a silent fallback', () => {
  const route = resolveRoute({ modelKey: 'notaprovider::x', rows: [account('anthropic')] });
  assert.match(route.error, /Unknown provider/);
});

test('a missing model id after "::" is refused', () => {
  const route = resolveRoute({ modelKey: 'anthropic::', rows: [account('anthropic')] });
  assert.match(route.error, /model id/);
});

test('registry keys map to providers by declared vendor', () => {
  assert.deepEqual(servicesForRegistryModel({ provider: 'Anthropic', key: 'claude-sonnet-5' }), ['anthropic', 'openrouter', 'litellm']);
  assert.deepEqual(servicesForRegistryModel({ provider: 'Google', key: 'gemini_3_8_flash' }), ['gemini', 'openrouter', 'litellm']);
  assert.deepEqual(servicesForRegistryModel({ provider: 'Base44', key: 'base1_5_1' }), []);
  assert.deepEqual(servicesForRegistryModel(null), []);
});

test('a registry key resolves to a configured provider, or reports the gap', () => {
  const routed = resolveRoute({
    modelKey: 'claude-sonnet-5',
    modelRow: { key: 'claude-sonnet-5', provider: 'Anthropic' },
    rows: [account('anthropic')],
  });
  assert.equal(routed.serviceId, 'anthropic');
  assert.equal(routed.mappedFrom, 'claude-sonnet-5');

  const unmapped = resolveRoute({
    modelKey: 'base1_5_1',
    modelRow: { key: 'base1_5_1', provider: 'Base44' },
    rows: [account('anthropic')],
  });
  assert.match(unmapped.error, /No configured provider can serve "base1_5_1"/);
});

test('"automatic" uses the highest-priority chat account, and fails clearly with none', () => {
  const routed = resolveRoute({ modelKey: 'automatic', rows: [account('groq')] });
  assert.equal(routed.serviceId, 'groq');
  const none = resolveRoute({ modelKey: 'automatic', rows: [] });
  assert.match(none.error, /No chat provider is configured/);
});

test('an empty model is refused', () => {
  assert.match(resolveRoute({ modelKey: '', rows: [] }).error, /model is required/);
});