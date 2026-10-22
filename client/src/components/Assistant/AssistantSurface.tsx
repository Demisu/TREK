import './assistant.css';

import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { useMemo } from 'react';

import AssistantThread from './AssistantThread';
import { type AssistantView, AssistantViewContext } from './assistantViewContext';
import { useAssistantRuntime } from './useAssistantRuntime';

export interface AssistantSurfaceProps extends AssistantView {
  /** Named in the composer's placeholder. */
  tripTitle: string;
}

/**
 * The chat for one trip, the same on the desktop window and the phone screen.
 * Its own chunk: this is the only module tree that pulls in @assistant-ui, so
 * nobody downloads the chat runtime before opening the assistant.
 */
export default function AssistantSurface({
  tripId,
  tripTitle,
  variant,
  density,
  onOpen,
  onFocusDay,
  onRevealMap,
}: AssistantSurfaceProps) {
  const runtime = useAssistantRuntime(tripId);
  // The phone is always compact; a window is what its width says.
  const view = useMemo(
    () => ({
      tripId,
      variant,
      density: variant === 'fullscreen' ? ('compact' as const) : (density ?? 'roomy'),
      onOpen,
      onFocusDay,
      onRevealMap,
    }),
    [tripId, variant, density, onOpen, onFocusDay, onRevealMap]
  );
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <AssistantViewContext.Provider value={view}>
        <AssistantThread tripTitle={tripTitle} />
      </AssistantViewContext.Provider>
    </AssistantRuntimeProvider>
  );
}
