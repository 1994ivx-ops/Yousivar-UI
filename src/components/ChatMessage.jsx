import { memo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Check, Copy, RotateCcw } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

function CodeBlock({ children }) {
  const [copied, setCopied] = useState(false);
  const child = Array.isArray(children) ? children[0] : children;
  const className = child?.props?.className || '';
  const language = (String(className).match(/language-([\w-]+)/) || [])[1] || 'code';
  const code = String(child?.props?.children ?? '');

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-border/80 bg-[hsl(var(--background))]">
      <div className="flex items-center justify-between border-b border-border/70 px-3 py-1.5">
        <span className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">{language}</span>
        <button
          onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-[12.5px] leading-relaxed">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}

function ChatMessage({ message, onRegenerate, streaming }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  return (
    <article className={cn('group flex flex-col gap-1.5', isUser ? 'items-end' : 'items-start')}>
      <div className={cn(
        'max-w-[92%] rounded-2xl px-4 py-3 text-[14px] leading-relaxed',
        isUser
          ? 'bg-primary/15 text-foreground ring-1 ring-primary/20'
          : 'surface text-foreground/95',
      )}>
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose-chat">
            <ReactMarkdown
              components={{
                pre: CodeBlock,
                code: ({ className, children }) => (
                  className
                    ? <code className={className}>{children}</code>
                    : <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[0.86em]">{children}</code>
                ),
              }}
            >
              {message.content || ''}
            </ReactMarkdown>
            {streaming && (
              <span className="ms-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse rounded-full bg-foreground/70" />
            )}
          </div>
        )}
      </div>

      <div className={cn('flex items-center gap-2.5 px-1 text-[10.5px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100',
        isUser && 'flex-row-reverse')}>
        {message.created_date && <span>{new Date(message.created_date).toLocaleTimeString()}</span>}
        {message.model && <span className="font-mono">{message.model}</span>}
        {typeof message.latency_ms === 'number' && <span>{message.latency_ms} ms</span>}
        <button
          onClick={() => { navigator.clipboard.writeText(message.content || ''); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="hover:text-foreground"
          aria-label={t('copy')}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </button>
        {!isUser && onRegenerate && (
          <button onClick={() => onRegenerate(message)} className="hover:text-foreground" aria-label={t('regenerate')}>
            <RotateCcw className="h-3 w-3" />
          </button>
        )}
      </div>
    </article>
  );
}

export default memo(ChatMessage);