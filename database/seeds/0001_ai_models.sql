-- Model registry seed — exported from the live Base44 workspace on 2026-11-01
-- (8 rows) so no model identifier is silently dropped by the migration.
-- Idempotent: re-running never duplicates a key.
--
-- `provider` records the vendor each key belongs to. The independent backend maps
-- that vendor onto a configured provider account at request time
-- (backend/src/services/chat.js → servicesForRegistryModel); a key with no
-- configured provider fails with an explicit message instead of silently
-- switching models.

insert into ai_models (key, label, provider, description, context_window, supports_vision, supports_web_search, supports_documents, enabled, sort_order)
values
  ('automatic',           'Auto routing',    'Base44 AI Gateway', 'Routes to the first configured provider account.', 128000,  true,  true,  true,  true, 0),
  ('gemini_3_8_flash',    'Gemini 3.8 Flash', 'Google',           null, 1000000, true,  true,  true,  true,  1),
  ('gpt_6_luna',          'GPT-6 Luna',      'OpenAI',            null, 400000,  true,  false, true,  true,  2),
  ('gpt_6_sol',           'GPT-6 Sol',       'OpenAI',            null, 400000,  true,  false, true,  true,  3),
  ('claude-sonnet-5',     'Claude Sonnet 5', 'Anthropic',         null, 200000,  true,  false, true,  true,  4),
  ('claude_opus_5_5',     'Claude Opus 5.5', 'Anthropic',         null, 200000,  true,  false, true,  true,  5),
  ('base1_5_1',           'Base 1.5.1',      'Base44',            null, 128000,  true,  false, true,  true,  6),
  ('glm_5_2',             'GLM 5.2',         'Zhipu',             null, 128000,  false, false, false, true,  7)
on conflict (key) do nothing;