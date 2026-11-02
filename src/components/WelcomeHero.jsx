import { useState } from 'react';
import { Play, Sparkles } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

const LOGO = 'https://i.postimg.cc/rwqsdLBd/yousivar.png';
const HERO_VIDEO = 'https://files.catbox.moe/grpwce.mp4';

export default function WelcomeHero({ onPick }) {
  const { t } = useI18n();
  const [videoFailed, setVideoFailed] = useState(false);
  const suggestions = t('suggestions');

  return (
    <section className="relative overflow-hidden rounded-[26px] border border-border/70">
      <div className="absolute inset-0">
        {!videoFailed && (
          <video
            className="h-full w-full object-cover opacity-70 motion-reduce:hidden"
            src={HERO_VIDEO}
            poster={LOGO}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            onError={() => setVideoFailed(true)}
          />
        )}
        <div className="absolute inset-0 bg-[radial-gradient(70%_120%_at_20%_0%,hsl(var(--primary)/0.28),transparent_60%)]" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/85 to-background/40" />
      </div>

      <div className="relative px-6 py-10 sm:px-10 sm:py-14">
        <div className="flex items-center gap-3">
          <img
            src={LOGO}
            alt="YOUSIVAR"
            className="h-11 w-11 rounded-2xl object-cover ring-1 ring-white/20"
          />
          <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10.5px] uppercase tracking-[0.22em] text-foreground/70">
            {t('poweredBy')}
          </span>
        </div>

        <h1 className="mt-6 max-w-2xl text-balance font-display text-3xl leading-[1.15] sm:text-[40px]">
          <span className="text-gradient">{t('welcomeTitle')}</span>
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
          {t('welcomeSub')}
        </p>

        <div className="mt-7 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          {t('startPrompt')}
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => onPick(s)}
              className="group flex items-start gap-2.5 rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 text-start text-[13px] leading-relaxed text-foreground/80 transition-all hover:border-primary/40 hover:bg-white/[0.07] hover:text-foreground"
            >
              <Play className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
              <span>{s}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}