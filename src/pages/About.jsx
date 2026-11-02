import { useI18n } from '@/lib/i18n';

const LOGO = 'https://i.postimg.cc/rwqsdLBd/yousivar.png';

export default function About() {
  const { t } = useI18n();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 pt-4">
      <header className="flex items-center gap-3">
        <img src={LOGO} alt="YOUSIVAR" className="h-12 w-12 rounded-2xl object-cover ring-1 ring-white/15" />
        <div>
          <h2 className="font-display text-2xl">{t('aboutTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('aboutSub')}</p>
        </div>
      </header>

      <section className="surface rounded-2xl p-4">
        <h3 className="mb-1.5 text-[13px] font-semibold">{t('privacy')}</h3>
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">{t('privacyBody')}</p>
      </section>

      <section className="surface rounded-2xl p-4">
        <h3 className="mb-1.5 text-[13px] font-semibold">{t('openSource')}</h3>
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          MIT licensed. The interface, data model and model registry live in this repository; the shared
          model registry is the single source of truth for routing keys and capability flags.
        </p>
      </section>

      <section className="surface rounded-2xl p-4">
        <h3 className="mb-2 text-[13px] font-semibold">{t('limitations')}</h3>
        <ul className="space-y-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
          <li>• Hosting: this build runs on the Base44 platform (database, auth, functions, storage). The Cloudflare Workers / D1 / R2 / Vectorize deployment described in the project brief needs a self-hosted deployment; the API and data model are kept portable for it.</li>
          <li>• Streaming: responses arrive as one model completion and render as a single message, not token-by-token.</li>
          <li>• Documents: the attached file is sent to the selected model with the prompt. Embedding-based chunk retrieval (Vectorize) is not part of this build.</li>
          <li>• Public OpenAI-compatible endpoints are not exposed by this hosted workspace; keys are issued and stored hashed for your own integrations.</li>
          <li>• Native iOS/Android builds are published from this same codebase through the platform; no local Capacitor project is included.</li>
        </ul>
      </section>
    </div>
  );
}