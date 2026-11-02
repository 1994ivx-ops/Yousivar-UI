import { useCallback, useState } from 'react';

/**
 * One authority for the chat request lifecycle. A transition outside the table
 * below is ignored, so a late network event can never move a finished turn back
 * into a loading state or show two indicators for one request.
 */
export const CHAT = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  WAITING: 'waiting',
  STREAMING: 'streaming',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  ERROR: 'error',
  RETRYING: 'retrying',
};

const TRANSITIONS = {
  idle: ['connecting', 'retrying'],
  connecting: ['waiting', 'streaming', 'error', 'cancelled'],
  waiting: ['streaming', 'error', 'cancelled'],
  streaming: ['completed', 'error', 'cancelled'],
  retrying: ['connecting', 'waiting', 'streaming', 'error', 'cancelled'],
  completed: ['connecting', 'retrying', 'cancelled'],
  cancelled: ['connecting', 'retrying'],
  error: ['retrying', 'connecting', 'cancelled'],
};

export function canTransition(from, to) {
  if (!from || from === to) return true;
  return (TRANSITIONS[from] || []).includes(to);
}

export const isBusy = (state) =>
  state === CHAT.CONNECTING || state === CHAT.WAITING || state === CHAT.STREAMING || state === CHAT.RETRYING;

export const showsIndicator = (state) => state === CHAT.CONNECTING || state === CHAT.WAITING || state === CHAT.RETRYING;

export function useChatState() {
  const [state, setState] = useState(CHAT.IDLE);
  const move = useCallback((next) => {
    setState((prev) => (canTransition(prev, next) ? next : prev));
  }, []);
  return [state, move];
}