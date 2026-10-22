import type { BookPageCard, BookPageSetup, BookSpread } from '@trek/shared';
import { useMemo } from 'react';

import { useTranslation } from '../../../../i18n';
import { useStudioStore } from '../../../../store/studioStore';
import { SpreadThumb } from '../../../Studio/SpreadThumb';
import type { ChangeItem } from '../../assistantParts';
import { useAssistantScope } from '../../assistantViewContext';
import { pageViewOf } from './bookCardModel';

/**
 * The page of a book change drawn small, from the book open in the Studio:
 * while the change waits, the page as it is and as the change would leave it;
 * once applied, the page as it is now. Each is the editor's own view under a
 * scale, so the card can never look different from the page. Pressing one
 * shows that page in the Studio. Nothing where the Studio does not hold the
 * page, outside the Studio or on another book.
 */

/** A thumbnail's height in pixels; its width follows the page. */
const THUMB_HEIGHT = 72;

/** One page drawn small; pressing it shows the page in the Studio. */
function PageThumb({
  spread,
  page,
  caption,
  onShow,
}: {
  spread: BookSpread;
  page: BookPageSetup;
  caption: string | null;
  onShow: () => void;
}) {
  const { t } = useTranslation();
  const wide = spread.role === 'inner' ? page.pageWidth * 2 : page.pageWidth;
  return (
    <button
      type="button"
      onClick={onShow}
      aria-label={t('assistant.card.book.showPage')}
      className="flex flex-col items-start gap-0.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <SpreadThumb
        spread={spread}
        page={page}
        width={(THUMB_HEIGHT * wide) / page.pageHeight}
        className="relative overflow-hidden rounded-sm ring-1 ring-edge-faint"
      />
      {caption && <span className="text-caption text-content-faint">{caption}</span>}
    </button>
  );
}

export default function BookPageThumbs({ card, item }: { card: BookPageCard; item: ChangeItem }) {
  const { t } = useTranslation();
  const scope = useAssistantScope();
  const doc = useStudioStore((s) => s.doc);
  const setActiveSpread = useStudioStore((s) => s.setActiveSpread);
  const view = useMemo(() => pageViewOf(card, doc, item.state), [card, doc, item.state]);
  // The Studio's book is this card's only in this journey's chat; anywhere else it may be another or an old copy.
  const ownBook = scope.kind === 'journey' && scope.journeyId === card.journeyId;
  if (!ownBook || !view || !doc) return null;
  const show = () => setActiveSpread(view.index);
  return (
    <div className="flex flex-wrap items-end gap-2">
      {view.before && (
        <PageThumb
          spread={view.before}
          page={doc.page}
          caption={view.after ? t('assistant.card.book.before') : null}
          onShow={show}
        />
      )}
      {view.after && (
        <PageThumb
          spread={view.after}
          page={doc.page}
          caption={view.before ? t('assistant.card.book.after') : null}
          onShow={show}
        />
      )}
    </div>
  );
}
