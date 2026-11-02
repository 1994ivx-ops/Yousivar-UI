import { cn } from '@/lib/utils';

export default function TypingIndicator({ className }) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)} aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="ysv-dot h-1.5 w-1.5 rounded-full bg-foreground/70"
          style={{ animationDelay: `${index * 160}ms` }}
        />
      ))}
    </span>
  );
}