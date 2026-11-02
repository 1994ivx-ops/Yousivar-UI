import TypingIndicator from '@/components/chat/TypingIndicator';

/**
 * One indicator for the whole pre-token phase. It reports only what is known:
 * connecting, waiting, or processing — never a fabricated internal model stage.
 */
export default function ThinkingState({ label }) {
  return (
    <div
      className="animate-fade flex w-fit items-center gap-3 rounded-2xl border border-border/60 bg-card/50 px-3.5 py-2.5 backdrop-blur-xl"
      role="status"
      aria-live="polite"
    >
      <span className="relative flex h-6 w-6 items-center justify-center">
        <span className="ysv-aura absolute inset-0 rounded-full border border-foreground/25" />
        <span className="ysv-aura absolute inset-0 rounded-full border border-foreground/15" style={{ animationDelay: '700ms' }} />
        <span className="ysv-pulse h-1.5 w-1.5 rounded-full bg-foreground/80" />
      </span>
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <TypingIndicator className="ms-0.5" />
    </div>
  );
}