import type { AssistantApplied } from '@trek/shared';
import { createContext, useContext } from 'react';

/** What the parts deep inside a chat need from whoever shows it. */
export interface AssistantView {
  tripId: number;
  /** 'window' on the desktop, 'fullscreen' on the phone. */
  variant: 'window' | 'fullscreen';
  /** How much room the chat has: a narrow window and the phone are 'compact'. */
  density?: 'compact' | 'roomy';
  /** Shows an applied change in the planner; the button is left out where nothing can show it. */
  onShowOnMap?: (applied: AssistantApplied) => void;
  /** Selects a day in the planner, from its weather; left out where no planner can show it. */
  onFocusDay?: (dayId: number) => void;
  /** Brings the map into view where the chat covers it (the phone), before the map moves. */
  onRevealMap?: () => void;
}

export const AssistantViewContext = createContext<AssistantView | null>(null);

export function useAssistantView(): AssistantView {
  const view = useContext(AssistantViewContext);
  if (!view) throw new Error('useAssistantView outside AssistantSurface');
  return view;
}
