import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROVIDERS, getProvider, publicCatalogue, assertUpstreamAllowed, sanitize, isReady,
  primaryValue, allSecretValues, hintFor, envFields,
} from '../src/services/providers.js';

test('the provider catalogue is intact after the port', () => {
  assert.equal(PROVIDERS.length, 19);
  const ids = PROVIDERS.map((provider) => provider.id);
  for (const expected of ['openrouter', 'anthropic', 'gemini', 'groq', 'deepseek', 'xai', 'mistral',
    'cloudflare', 'litellm', 'openai_compatible', 'ollama', 'vllm', 'llamacpp',
    'tavily', 'exa', 'google_search', 'firecrawl', 'telegram', 'elevenlabs']) {
    assert.ok(ids.includes(expected), `${expected} missing`);
  }
  assert.equal(getProvider('anthropic').baseUrl, 'https://api.anthropic.com/v1');
  assert.equal(getProvider('nope'), null);
});

test('the public catalogue never exposes env names or secrets', () => {
  const publicJson = JSON.stringify(publicCatalogue());
  assert.ok(!publicJson.includes('OPENROUTER_API_KEY'));
  assert.ok(!publicJson.includes('envVar'));
  const openrouter = publicCatalogue().find((entry) => entry.id === 'openrouter');
  assert.deepEqual(Object.keys(openrouter).sort(), ['features', 'fields', 'group', 'id', 'keyUrl', 'label', 'note'].sort());
});

test('cloud metadata endpoints are always blocked', () => {
  assert.throws(() => assertUpstreamAllowed('http://169.254.169.254/latest/meta-data'), /blocked/i);
  assert.throws(() => assertUpstreamAllowed('http://metadata.google.internal/computeMetadata/v1'), /blocked/i);
  assert.throws(() => assertUpstreamAllowed('http://0.0.0.0:8080'), /not routable/i);
  assert.throws(() => assertUpstreamAllowed('file:///etc/passwd'), /http and https/i);
  assert.throws(() => assertUpstreamAllowed('not a url'), /valid URL/i);
});

test('legitimate self-hosted endpoints stay allowed', () => {
  assert.equal(assertUpstreamAllowed('https://openrouter.ai/api/v1'), 'https://openrouter.ai/api/v1');
  assert.equal(assertUpstreamAllowed('http://192.168.1.10:11434/v1'), 'http://192.168.1.10:11434/v1');
  assert.equal(assertUpstreamAllowed('http://localhost:4000/v1'), 'http://localhost:4000/v1');
});

test('sanitize redacts every secret value it is given', () => {
  const secrets = ['sk-ant-super-secret-value', 'tvly-another-secret'];
  const message = sanitize('Request failed: sk-ant-super-secret-value rejected by tvly-another-secret', secrets);
  assert.ok(!message.includes('sk-ant-super-secret-value'));
  assert.ok(!message.includes('tvly-another-secret'));
  assert.match(message, /\[redacted\]/);
});

test('readiness requires every non-optional credential', () => {
  const def = getProvider('google_search');
  assert.equal(isReady(def, { API_KEY: 'k' }), false);
  assert.equal(isReady(def, { API_KEY: 'k', ENGINE_ID: 'cx' }), true);

  const optional = getProvider('openai_compatible');
  assert.equal(isReady(optional, {}), true);
});

test('the primary credential and its hint come from the declared field', () => {
  const def = getProvider('anthropic');
  const creds = { API_KEY: 'sk-ant-abcdefgh1234' };
  assert.equal(primaryValue(def, creds), 'sk-ant-abcdefgh1234');
  assert.equal(hintFor(def, creds), '••••1234');
  assert.deepEqual(allSecretValues({ API_KEY: 'a', OTHER: '' }), ['a']);
});

test('deployment secrets are read from the environment by their declared name', () => {
  const def = getProvider('groq');
  assert.deepEqual(envFields(def, { GROQ_API_KEY: 'gsk_live' }), { API_KEY: 'gsk_live' });
  assert.deepEqual(envFields(def, {}), {});
});