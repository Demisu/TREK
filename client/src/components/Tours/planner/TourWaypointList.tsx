import { ArrowDown, ArrowUp, GripVertical, MapPin, MapPinPlus, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from '../../../i18n';
import { toggleTourPlacing, useTourPlaceToolStore } from '../../../store/tourPlaceToolStore';
import { SoftPill } from '../../Planner/planParts';
import { fs } from '../../shared/DialogShell';
import { Tooltip } from '../../shared/Tooltip';
import { TourSection } from '../tourParts';
import type { TourPlannerController } from './useTourPlanner';
import { useWaypointPlaceNames } from './useWaypointPlaceNames';

type DropTarget = { id: string; placement: 'before' | 'after' };

const ROLE_KEY = {
  start: 'tours.planner.start',
  via: 'tours.planner.via',
  end: 'tours.planner.end',
} as const;

/** A quiet icon control on a waypoint row; it stops the click so the row is not selected too. */
function WaypointAction({
  label,
  disabled,
  danger = false,
  onAct,
  children,
}: {
  label: string;
  disabled: boolean;
  danger?: boolean;
  onAct: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        disabled={disabled}
        aria-label={label}
        aria-disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          if (!disabled) onAct();
        }}
        className={`grid h-6 w-6 place-items-center rounded-full transition-colors ${disabled ? 'pointer-events-none opacity-25' : danger ? 'text-danger hover:bg-surface-card' : 'text-content-muted hover:bg-surface-card hover:text-content'}`}
      >
        {children}
      </button>
    </Tooltip>
  );
}

/** The quiet hint and first-use guidance before a route exists. */
function WaypointEmptyState() {
  const { t } = useTranslation();
  return (
    <div
      data-testid="tour-planner-empty-state"
      className="flex items-start gap-2 rounded-[12px] border border-dashed border-edge px-3 py-3 leading-snug text-content-muted"
      style={fs(12, 'body')}
    >
      <MapPin size={14} strokeWidth={2} className="mt-px flex-none text-content-faint" />
      <p className="m-0">{t('tours.planner.emptyHint')}</p>
    </div>
  );
}

/**
 * The row under the last waypoint that turns on "set points" for the map the
 * planner shows, the same switch as the one in the map's layer pill; while it
 * is on, the row says where to click and a second click turns it off again.
 */
function AddPointRow({ disabled }: { disabled: boolean }) {
  const { t } = useTranslation();
  const active = useTourPlaceToolStore((state) => state.placing[state.mode]);
  return (
    <button
      type="button"
      data-testid="tour-planner-add-point"
      aria-pressed={active}
      disabled={disabled}
      onClick={() => toggleTourPlacing()}
      className={`mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-[12px] border border-dashed px-3 py-2.5 font-semibold transition-colors disabled:cursor-default disabled:opacity-40 ${active ? 'border-accent bg-surface-card text-content' : 'border-edge text-content-muted enabled:hover:border-content-faint enabled:hover:text-content'}`}
      style={fs(12, 'body')}
    >
      <MapPinPlus size={14} strokeWidth={2} className="flex-none" />
      <span className="min-w-0 truncate">{t(active ? 'tours.planner.addPointActive' : 'tours.planner.addPoint')}</span>
    </button>
  );
}

/**
 * The ordered waypoints, each under its place name with its role as a badge,
 * reorderable by drag or by the arrow controls on each row. The coordinates
 * stand in for the name while it loads, offline, or when the lookup has none.
 */
export default function TourWaypointList({
  planner,
  canEdit,
  isSaving,
}: {
  planner: TourPlannerController;
  canEdit: boolean;
  isSaving: boolean;
}) {
  const { t } = useTranslation();
  const [draggedWaypointId, setDraggedWaypointId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const placeNames = useWaypointPlaceNames(planner.waypoints);
  const lastIndex = planner.waypoints.length - 1;
  const movable = canEdit && !isSaving;
  const endDrag = () => {
    setDraggedWaypointId(null);
    setDropTarget(null);
  };

  if (planner.waypoints.length === 0) {
    return (
      <TourSection label={t('tours.planner.waypoints')}>
        <WaypointEmptyState />
        {canEdit && <AddPointRow disabled={isSaving} />}
      </TourSection>
    );
  }

  return (
    <TourSection label={t('tours.planner.waypoints')}>
      <ol data-touch-drag className="m-0 flex list-none flex-col gap-px p-0">
        {planner.waypoints.map((point, index) => {
          const selected = planner.selectedWaypointId === point.id;
          const isDropTarget = dropTarget?.id === point.id && draggedWaypointId !== point.id;
          const placeName = placeNames[point.id];
          const coordinates = `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
          return (
            <li
              key={point.id}
              data-testid="tour-planner-waypoint-row"
              onDragStart={(event) => {
                if (!movable) {
                  event.preventDefault();
                  return;
                }
                if (event.dataTransfer) {
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', point.id);
                }
                setDraggedWaypointId(point.id);
                setDropTarget(null);
              }}
              onDragOver={(event) => {
                if (!movable || !draggedWaypointId || draggedWaypointId === point.id) return;
                event.preventDefault();
                if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
                const bounds = event.currentTarget.getBoundingClientRect();
                const placement = event.clientY >= bounds.top + bounds.height / 2 ? 'after' : 'before';
                setDropTarget((current) =>
                  current?.id === point.id && current.placement === placement ? current : { id: point.id, placement }
                );
              }}
              onDrop={(event) => {
                event.preventDefault();
                const draggedId = draggedWaypointId || event.dataTransfer.getData('text/plain');
                if (movable && draggedId && draggedId !== point.id && dropTarget?.id === point.id) {
                  planner.reorderWaypoint(draggedId, point.id, dropTarget.placement);
                }
                endDrag();
              }}
              onDragEnd={endDrag}
              className={`relative rounded-[12px] ${draggedWaypointId === point.id ? 'opacity-45' : ''} ${isDropTarget ? 'bg-surface-hover' : ''}`}
            >
              {isDropTarget && (
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-x-2 z-10 h-0.5 rounded bg-accent ${dropTarget.placement === 'before' ? 'top-0' : 'bottom-0'}`}
                />
              )}
              <div className="group flex w-full items-center gap-2.5 rounded-[12px] px-2 py-1.5">
                <span
                  draggable={movable}
                  aria-hidden="true"
                  data-testid="tour-planner-waypoint-drag-handle"
                  className={`grid h-6 w-5 flex-none place-items-center text-content-faint ${movable ? 'cursor-grab active:cursor-grabbing' : 'opacity-35'}`}
                >
                  <GripVertical size={14} strokeWidth={1.8} />
                </span>
                <span
                  aria-label={t('tours.planner.waypointLabel', { n: index + 1 })}
                  data-waypoint-number={index + 1}
                  className={`grid h-7 w-7 flex-none place-items-center rounded-[9px] font-geist font-semibold tabular-nums shadow-sm ${selected ? 'bg-accent text-accent-text' : 'bg-surface-card text-content'}`}
                  style={fs(11.5)}
                >
                  {index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => planner.setSelectedWaypointId(point.id)}
                  className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-start outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-[color:var(--text-primary)]"
                  aria-current={selected ? 'true' : undefined}
                >
                  <span className="flex w-full min-w-0 items-center gap-1.5">
                    <span
                      data-testid="tour-planner-waypoint-name"
                      className={`block min-w-0 truncate leading-tight ${placeName ? 'font-semibold text-content' : 'font-geist tabular-nums text-content-muted'}`}
                      style={fs(12.5, 'body')}
                    >
                      {placeName ?? coordinates}
                    </span>
                    <SoftPill>{t(ROLE_KEY[point.role])}</SoftPill>
                  </span>
                  {placeName && (
                    <span
                      data-testid="tour-planner-waypoint-coordinates"
                      className="block min-w-0 truncate font-geist tabular-nums leading-tight text-content-faint"
                      style={fs(10.5)}
                    >
                      {coordinates}
                    </span>
                  )}
                </button>
                {canEdit && (
                  <span
                    className={`flex flex-none items-center gap-0.5 transition-opacity ${selected ? '' : 'opacity-50 group-focus-within:opacity-100 group-hover:opacity-100'}`}
                  >
                    <WaypointAction
                      label={t('tours.planner.moveUp')}
                      disabled={isSaving || index === 0}
                      onAct={() => planner.moveWaypoint(point.id, -1)}
                    >
                      <ArrowUp size={13} strokeWidth={2.2} />
                    </WaypointAction>
                    <WaypointAction
                      label={t('tours.planner.moveDown')}
                      disabled={isSaving || index === lastIndex}
                      onAct={() => planner.moveWaypoint(point.id, 1)}
                    >
                      <ArrowDown size={13} strokeWidth={2.2} />
                    </WaypointAction>
                    <WaypointAction
                      label={t('tours.planner.remove')}
                      disabled={isSaving}
                      danger
                      onAct={() => planner.removeWaypoint(point.id)}
                    >
                      <Trash2 size={13} strokeWidth={2} />
                    </WaypointAction>
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {canEdit && <AddPointRow disabled={isSaving} />}
    </TourSection>
  );
}
