import { useEffect, useRef } from 'react';
import ChatMessage from '@/components/ChatMessage';
import ThinkingState from '@/components/chat/ThinkingState';
import { CHAT, showsIndicator } from '@/lib/chatMachine';
import { useI18n } from '@/lib/i18n';

export default function MessageList({ messages, onRegenerate, status, liveText }) {
  const { t } = useI18n();
  const endRef = useRef(null);
  const nearRef = useRef(true);

  // Auto-scroll only while the reader stays close to the end of the conversation.
  useEffect(() => {
    const onScroll = () => {
      const gap = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
      nearRef.current = gap < 240;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!nearRef.current) return;
    endRef.current?.scrollIntoView({ behavior: status === CHAT.STREAMING ? 'auto' : 'smooth', block: 'end' });
  }, [messages.length, liveText.length, status]);

  const label = status === CHAT.CONNECTING ? t('connectingLabel') : t('waitingLabel');

  return (
    <div className="flex flex-col gap-5 pb-2">
      {messages.map((message) => (
        <ChatMessage
          key={message.id}
          message={message}
          onRegenerate={message.role === 'assistant' ? onRegenerate : undefined}
        />
      ))}

      {liveText ? (
        <ChatMessage
          message={{ id: 'live', role: 'assistant', content: liveText }}
          streaming={status === CHAT.STREAMING}
        />
      ) : showsIndicator(status) ? (
        <ThinkingState label={label} />
      ) : null}

      <div ref={endRef} />
    </div>
  );
}