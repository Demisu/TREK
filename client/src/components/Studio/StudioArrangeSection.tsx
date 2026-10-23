import type { BookAlignEdge, BookAlignTo, BookSpread } from '@trek/shared';
import { distributableCount, isWholeGroup } from '@trek/shared';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  Group,
  Paintbrush,
  Pipette,
  Ungroup,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';

import { useStudioStore } from '../../store/studioStore';
import { Tooltip } from '../shared/Tooltip';
import { Choice, Section } from './StudioControls';
import { useStudioShortcut } from './studioShortcut';

/**
 * Align, distribute, group and the style clipboard, for whatever is selected.
 *
 * The align bar lines a multi-selection up within its own box by default, and
 * a single element (or one whole group) against its page, since there is
 * nothing else for it to line up with. Groups move as one box throughout
 * (shared/src/book/book-arrange.ts). Every press is one undo step.
 */

const ALIGN: { edge: BookAlignEdge; icon: LucideIcon; labelKey: string }[] = [
  { edge: 'left', icon: AlignStartVertical, labelKey: 'journey.studio.layers.alignLeft' },
  { edge: 'center', icon: AlignCenterVertical, labelKey: 'journey.studio.layers.alignCenter' },
  { edge: 'right', icon: AlignEndVertical, labelKey: 'journey.studio.layers.alignRight' },
  { edge: 'top', icon: AlignStartHorizontal, labelKey: 'journey.studio.layers.alignTop' },
  { edge: 'middle', icon: AlignCenterHorizontal, labelKey: 'journey.studio.layers.alignMiddle' },
  { edge: 'bottom', icon: AlignEndHorizontal, labelKey: 'journey.studio.layers.alignBottom' },
];

/** How many things move as one in a selection: a group counts once. */
function unitCount(spread: BookSpread, ids: string[]): number {
  return distributableCount(
    spread,
    spread.elements.filter((e) => ids.includes(e.id))
  );
}

function IconButton({
  label,
  icon: Icon,
  onClick,
  disabled,
  shortcut,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  shortcut?: readonly string[];
}) {
  return (
    <Tooltip label={label} shortcut={shortcut}>
      <button type="button" className="st-chip is-icon" onClick={onClick} disabled={disabled} aria-label={label}>
        <Icon size={14} />
      </button>
    </Tooltip>
  );
}

export function StudioArrangeSection({ spreadIndex, t }: { spreadIndex: number; t: (k: string) => string }) {
  const spread = useStudioStore((s) => s.doc?.spreads[spreadIndex]);
  const selection = useStudioStore((s) => s.selection);
  const hasStyle = useStudioStore((s) => s.styleClip !== null);
  const align = useStudioStore((s) => s.align);
  const distribute = useStudioStore((s) => s.distribute);
  const group = useStudioStore((s) => s.group);
  const ungroup = useStudioStore((s) => s.ungroup);
  const copyStyle = useStudioStore((s) => s.copyStyle);
  const pasteStyle = useStudioStore((s) => s.pasteStyle);
  const keys = useStudioShortcut();
  const [chosenTo, setChosenTo] = useState<BookAlignTo | null>(null);

  if (!spread || !selection.length) return null;
  const sel = spread.elements.filter((e) => selection.includes(e.id));
  const movable = sel.filter((e) => !e.locked).map((e) => e.id);
  const units = unitCount(spread, movable);
  // One thing has nothing to line up with but its page.
  const to: BookAlignTo = units < 2 ? (chosenTo === 'safe' ? 'safe' : 'page') : (chosenTo ?? 'selection');
  const grouped = sel.some((e) => e.group);
  const canGroup = movable.length >= 2 && !isWholeGroup(spread, movable);
  const asGroup = selection.length > 1 && isWholeGroup(spread, selection);

  return (
    // Open for a multi-selection, where lining up is what comes next; folded for one element.
    <Section key={units > 1 ? 'many' : 'one'} label={t('journey.studio.layers.align')} defaultOpen={units > 1}>
      <div className="st-row">
        {ALIGN.map((a) => (
          <IconButton
            key={a.edge}
            label={t(a.labelKey)}
            icon={a.icon}
            disabled={!movable.length}
            onClick={() => align(spreadIndex, a.edge, to)}
          />
        ))}
        <span className="st-row-sep" aria-hidden />
        <IconButton
          label={t('journey.studio.layers.distributeH')}
          icon={AlignHorizontalDistributeCenter}
          disabled={units < 3}
          onClick={() => distribute(spreadIndex, 'horizontal')}
        />
        <IconButton
          label={t('journey.studio.layers.distributeV')}
          icon={AlignVerticalDistributeCenter}
          disabled={units < 3}
          onClick={() => distribute(spreadIndex, 'vertical')}
        />
      </div>
      <div className="st-arrange-to">
        <span className="st-line-label">{t('journey.studio.layers.alignTo')}</span>
        <Choice<BookAlignTo>
          value={to}
          ariaLabel={t('journey.studio.layers.alignTo')}
          options={[
            { value: 'selection' as const, label: t('journey.studio.layers.toSelection'), disabled: units < 2 },
            { value: 'page' as const, label: t('journey.studio.layers.toPage') },
            { value: 'safe' as const, label: t('journey.studio.layers.toSafe') },
          ]}
          onPick={setChosenTo}
        />
      </div>
      <div className="st-row st-arrange-acts">
        {(canGroup || !grouped) && (
          <IconButton
            label={t('journey.studio.layers.groupAction')}
            icon={Group}
            disabled={!canGroup}
            shortcut={keys('G')}
            onClick={() => group(spreadIndex)}
          />
        )}
        {grouped && (
          <IconButton
            label={t('journey.studio.layers.ungroup')}
            icon={Ungroup}
            shortcut={keys('⇧', 'G')}
            onClick={() => ungroup(spreadIndex)}
          />
        )}
        <span className="st-row-sep" aria-hidden />
        <IconButton
          label={t('journey.studio.layers.copyStyle')}
          icon={Pipette}
          shortcut={keys('alt', 'C')}
          onClick={() => copyStyle(spreadIndex)}
        />
        <IconButton
          label={t('journey.studio.layers.pasteStyle')}
          icon={Paintbrush}
          disabled={!hasStyle || !movable.length}
          shortcut={keys('alt', 'V')}
          onClick={() => pasteStyle(spreadIndex)}
        />
      </div>
      {asGroup && <p className="st-hint st-arrange-hint">{t('journey.studio.layers.groupHint')}</p>}
    </Section>
  );
}
