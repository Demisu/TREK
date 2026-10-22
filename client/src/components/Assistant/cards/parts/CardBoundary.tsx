import type { ReactNode } from 'react';

import ErrorBoundary from '../../../shared/ErrorBoundary';

/**
 * Around every card and every slot of a kind's view the chat draws: one that
 * throws while it renders is logged and drawn as its `fallback` (nothing,
 * unless the caller hands what the row shows without a card), and the answer
 * around it stays.
 */
export default function CardBoundary({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <ErrorBoundary boundaryId="assistant-card" fallback={fallback}>
      {children}
    </ErrorBoundary>
  );
}
