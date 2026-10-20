import { Package } from 'lucide-react';
import { useTranslation } from '../../../i18n';
import { tintOf, WhiteBadge } from '../../Planner/planParts';

/** A packing category's own colour, as the packing list gives it, with a soft halo of the same colour. */
export function CategoryDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="h-2.5 w-2.5 flex-none rounded-full"
      style={{ background: color, boxShadow: `0 0 0 3px ${tintOf(color, 24)}` }}
    />
  );
}

/** How many items a list or category holds, as a badge; the count is read out in words. */
export function CountBadge({ count }: { count: number }) {
  const { t } = useTranslation();
  return (
    <span aria-label={t('tours.packing.items', { count })} className="inline-flex">
      <WhiteBadge icon={<Package size={10} strokeWidth={2.2} className="flex-none text-content-faint" />}>
        {count}
      </WhiteBadge>
    </span>
  );
}
