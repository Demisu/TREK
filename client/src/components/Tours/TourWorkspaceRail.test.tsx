import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '../../../tests/helpers/render';
import TourWorkspaceRail from './TourWorkspaceRail';
import type { GpxConversion } from './conversion/useGpxConversion';
import type { TourPlannerController } from './planner/useTourPlanner';
import type { RecordedTrack } from './useRecordedTrack';
import type { WandererBrowser } from './wanderer/useWandererBrowser';

const seen = vi.hoisted(() => ({ rail: [] as Array<Record<string, unknown>> }));
vi.mock('./planner/TourPlannerPanels', () => ({
  TourPlannerRail: (props: Record<string, unknown>) => {
    seen.rail.push(props);
    return <p>tour editor</p>;
  },
}));
vi.mock('./wanderer/WandererBrowserRail', () => ({ default: () => <p>wanderer trails</p> }));

const planner = {} as TourPlannerController;
const conversion = {} as GpxConversion;
const recordedTrack = {} as RecordedTrack;

function wanderer(overrides: Partial<WandererBrowser>): WandererBrowser {
  return { open: false, enabled: true, openBrowser: vi.fn(), ...overrides } as unknown as WandererBrowser;
}

describe('TourWorkspaceRail', () => {
  it('RS-04: shows the wanderer trails in place of the editor while they are browsed', () => {
    render(
      <TourWorkspaceRail
        planner={planner}
        wanderer={wanderer({ open: true })}
        conversion={conversion}
        recordedTrack={recordedTrack}
        canEdit
        canAssign
      />
    );
    expect(screen.getByText('wanderer trails')).toBeInTheDocument();
    expect(screen.queryByText('tour editor')).not.toBeInTheDocument();
  });

  it('RS-04: offers the wanderer trails from the editor only while wanderer may be used', () => {
    const browser = wanderer({});
    seen.rail.length = 0;
    const view = render(
      <TourWorkspaceRail
        planner={planner}
        wanderer={browser}
        conversion={conversion}
        recordedTrack={recordedTrack}
        canEdit
        canAssign={false}
      />
    );
    expect(screen.getByText('tour editor')).toBeInTheDocument();
    expect(seen.rail[seen.rail.length - 1]).toMatchObject({
      planner,
      conversion,
      recordedTrack,
      canEdit: true,
      canAssign: false,
      onOpenWanderer: browser.openBrowser,
    });

    view.rerender(
      <TourWorkspaceRail
        planner={planner}
        wanderer={wanderer({ enabled: false })}
        conversion={conversion}
        recordedTrack={recordedTrack}
        canEdit
        canAssign
      />
    );
    expect(seen.rail[seen.rail.length - 1]?.onOpenWanderer).toBeUndefined();
  });
});
