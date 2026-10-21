import { type AppendMessage, useExternalStoreRuntime } from '@assistant-ui/react';
import type { AssistantMessage } from '@trek/shared';
import { useMemo } from 'react';

import { useNetworkMode } from '../../hooks/useNetworkMode';
import { pendingToolCallIds } from '../../store/assistantMessages';
import { chatOf, useAssistantStore } from '../../store/assistantStore';
import { toThreadMessage } from './assistantModel';

function textOf(message: AppendMessage): string {
  const texts: string[] = [];
  for (const part of message.content) if (part.type === 'text') texts.push(part.text);
  return texts.join('\n');
}

/**
 * The one place the chat runtime is built. The assistant store stays the
 * source of truth: the runtime reads its messages through `toThreadMessage`
 * and hands sending and stopping back to it. There is no editing, branching
 * or reloading, so the thread stays the line the server keeps.
 *
 * Offline the composer is off; while a change waits for a decision, typing
 * works but sending waits, because the model is still waiting for that answer.
 */
export function useAssistantRuntime(tripId: number) {
  const messages = useAssistantStore((s) => chatOf(s, tripId).messages);
  const isRunning = useAssistantStore((s) => chatOf(s, tripId).isRunning);
  const isLoading = useAssistantStore((s) => chatOf(s, tripId).loading);
  const send = useAssistantStore((s) => s.send);
  const cancel = useAssistantStore((s) => s.cancel);
  const { offline } = useNetworkMode();
  const waiting = useMemo(() => pendingToolCallIds(messages).length > 0, [messages]);

  return useExternalStoreRuntime<AssistantMessage>({
    messages,
    convertMessage: toThreadMessage,
    isRunning,
    isLoading,
    isDisabled: offline,
    isSendDisabled: waiting,
    onNew: (message) => send(tripId, textOf(message)),
    onCancel: async () => cancel(tripId),
  });
}
