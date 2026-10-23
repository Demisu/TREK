import { BOOK_STICKER_THEMES, type BookPageSetup } from '@trek/shared';
import { bookStickersOf, type BookStickerDef } from '@trek/shared/stickers';
import { Search, X } from 'lucide-react';
import { useMemo, useState, type DragEvent } from 'react';

import { useStudioStore } from '../../store/studioStore';
import '../../styles/studio-stickers.css';
import { StickerArt } from './StickerView';
import { PanelHead } from './StudioPanelHead';
import {
  STICKER_DRAG_TYPE,
  matchStickers,
  newStickerElement,
  readRecentStickers,
  rememberSticker,
  stickerLabel,
  stickerThemeLabel,
} from './stickerLibrary';

/**
 * The sticker library, as a section of the rail: illustrations to put on a
 * page, grouped by theme, searchable in the reader's language, with the ones
 * this viewer placed last on a shelf of their own.
 *
 * A click places a sticker in the middle of the page, a drag places it where
 * it is let go. Either way it arrives selected, so the inspector beside the
 * page is where it is recoloured, flipped and turned.
 */

type Translate = (k: string, params?: Record<string, string | number>) => string;

function StickerTile({ def, t, onPick }: { def: BookStickerDef; t: Translate; onPick: (def: BookStickerDef) => void }) {
  const label = stickerLabel(t, def.id);
  const onDragStart = (e: DragEvent<HTMLButtonElement>) => {
    e.dataTransfer.setData(STICKER_DRAG_TYPE, def.id);
    e.dataTransfer.effectAllowed = 'copy';
  };
  return (
    <button
      type="button"
      className="st-shape-btn st-sticker-btn"
      draggable
      onDragStart={onDragStart}
      onClick={() => onPick(def)}
      title={label}
      aria-label={label}
      style={{ cursor: 'grab' }}
    >
      <StickerArt def={def} />
    </button>
  );
}

function StickerGrid({
  list,
  t,
  onPick,
}: {
  list: readonly BookStickerDef[];
  t: Translate;
  onPick: (def: BookStickerDef) => void;
}) {
  return (
    <div className="st-shape-grid">
      {list.map((def) => (
        <StickerTile key={def.id} def={def} t={t} onPick={onPick} />
      ))}
    </div>
  );
}

export function StudioStickersPanel({ page, t }: { page: BookPageSetup; t: Translate }) {
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<BookStickerDef[]>(readRecentStickers);
  const addElement = useStudioStore((s) => s.addElement);
  const active = useStudioStore((s) => s.activeSpread);
  const role = useStudioStore((s) => s.doc?.spreads[s.activeSpread]?.role);
  const single = role !== undefined && role !== 'inner';

  const matches = useMemo(() => matchStickers(query, null, t), [query, t]);
  const browsing = !query.trim();

  const place = (def: BookStickerDef) => {
    addElement(active, newStickerElement(def, page, single));
    setRecent(rememberSticker(def.id));
  };

  return (
    <>
      <PanelHead label={t('journey.studio.stickers')} count={browsing ? undefined : matches.length} />
      <div className="st-search">
        <Search size={14} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('journey.studio.searchStickers')}
          aria-label={t('journey.studio.searchStickers')}
          spellCheck={false}
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label={t('common.clear')}>
            <X size={13} />
          </button>
        )}
      </div>

      <div className="st-panel-scroll">
        {browsing && recent.length > 0 && (
          <div className="st-section">
            <div className="st-section-label">{t('journey.studio.stickersRecent')}</div>
            <StickerGrid list={recent} t={t} onPick={place} />
          </div>
        )}

        {/* Browsing, the library by theme; searching, one grid of what matches. */}
        {browsing ? (
          BOOK_STICKER_THEMES.map((id) => (
            <div className="st-section" key={id}>
              <div className="st-section-label">{stickerThemeLabel(t, id)}</div>
              <StickerGrid list={bookStickersOf(id)} t={t} onPick={place} />
            </div>
          ))
        ) : (
          <div className="st-section">
            <StickerGrid list={matches} t={t} onPick={place} />
            {!matches.length && <p className="st-hint">{t('journey.studio.noMatches')}</p>}
          </div>
        )}

        <p className="st-hint">{t('journey.studio.stickersHint')}</p>
      </div>
    </>
  );
}
