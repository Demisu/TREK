/**
 * TourWalkImportMcp (CW-07, WALK-IMPORT-MCP-*): the Google Maps walk preview
 * over MCP, with the same service and checks as REST. The subject comes from
 * the container over a snapshot test db; the refusal text comes back through
 * the registry's error mapper, as a client sees it.
 */
import { trekMcpErrorMapper } from '../../../src/mcp/nest-mcp-policy';
import type { McpContext } from '../../../src/nest-mcp';
import { DomainError, catchDomainError } from '../../../src/nest/common/domain-error';
import { McpToolGuardsService } from '../../../src/nest/mcp-shared/mcp-tool-guards.service';
import { GoogleMapsShortLinkProvider } from '../../../src/nest/place-import/providers/google-maps-short-link.provider';
import { TourWalkImportMcp } from '../../../src/nest/tours/tour-walk-import.mcp';
import { ToursModule } from '../../../src/nest/tours/tours.module';
import { PORTO_RIBEIRA } from '../../fixtures/google-maps-walks';
import { createSnapshotTestDb } from '../../helpers/db-mock';
import { createTrip, createUser } from '../../helpers/factories';
import { resetTestDb } from '../../helpers/test-db';
import { createTestModule, type TestModule } from '../../helpers/test-module';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const db = createSnapshotTestDb();
const resolve = vi.fn();
let t: TestModule;
let mcp: TourWalkImportMcp;

beforeAll(async () => {
  t = await createTestModule({
    db,
    imports: [ToursModule],
    overrides: [{ provide: GoogleMapsShortLinkProvider, useValue: { resolve } }],
  });
  mcp = t.get(TourWalkImportMcp);
});
beforeEach(() => {
  resetTestDb(db);
  resolve.mockReset();
});
afterAll(async () => {
  await t.close();
  db.close();
});

const ctx = (userId: number) => ({ userId }) as McpContext;

function read(result: { content: Array<{ type: string; text: string }>; isError?: boolean }) {
  const text = result.content[0]?.text ?? '';
  return result.isError ? { error: text } : JSON.parse(text);
}

function fixture() {
  const { user } = createUser(db);
  const { user: outsider } = createUser(db);
  const trip = createTrip(db, user.id, { title: 'Porto' });
  return { user, outsider, trip };
}

describe('TourWalkImportMcp', () => {
  it('WALK-IMPORT-MCP-001: preview_google_maps_walk reads the stops of a walking route and stores nothing', async () => {
    const { user, trip } = fixture();
    const answer = read(await mcp.previewGoogleMapsWalk({ tripId: trip.id, url: PORTO_RIBEIRA }, ctx(user.id)));
    expect(answer.resolved_url).toBe(PORTO_RIBEIRA);
    expect(answer.stations).toHaveLength(5);
    expect(answer.stations[3]).toEqual({ name: 'Mirador de Porto y Duero', lat: 41.1391452, lng: -8.609616 });
    expect(resolve).not.toHaveBeenCalled();
  });

  it('WALK-IMPORT-MCP-002: nothing for someone outside the trip, nor for a member who may not edit places', async () => {
    const { user, outsider, trip } = fixture();
    expect((await mcp.previewGoogleMapsWalk({ tripId: trip.id, url: PORTO_RIBEIRA }, ctx(outsider.id))).isError).toBe(
      true,
    );
    const denied = vi.spyOn(t.get(McpToolGuardsService), 'hasTripPermission').mockResolvedValue(false);
    const result = await mcp.previewGoogleMapsWalk({ tripId: trip.id, url: PORTO_RIBEIRA }, ctx(user.id));
    expect(result.isError).toBe(true);
    expect(denied).toHaveBeenCalledWith('place_edit', trip.id, user.id);
    denied.mockRestore();
  });

  it('WALK-IMPORT-MCP-003: a route not on foot is refused with the English text REST sends', async () => {
    const { user, trip } = fixture();
    const car = PORTO_RIBEIRA.replace(/!3e2$/, '!3e0');
    const err = await catchDomainError(() => mcp.previewGoogleMapsWalk({ tripId: trip.id, url: car }, ctx(user.id)));
    expect(err).toBeInstanceOf(DomainError);
    expect(trekMcpErrorMapper(err)).toEqual({
      content: [
        {
          type: 'text',
          text: 'That route is not planned on foot. Switch Google Maps to walking and share the route again.',
        },
      ],
      isError: true,
    });
  });
});
