/**
 * MAPS-SUGMERGE-001..004: the index's suggestions and Photon's in one list (#2877).
 *
 * The keystroke path asks the index with its OpenStreetMap layer and Photon at
 * once. Both carry OpenStreetMap places, so the same element can come back from
 * each side, and one list must show it once while still showing what only
 * Photon found.
 */
import { mergeSuggestions } from '../../../src/nest/maps/maps-index.helpers';

import { describe, it, expect } from 'vitest';

const row = (placeId: string, mainText: string, lat: number, lng: number, source: string) => ({
  placeId,
  mainText,
  secondaryText: '',
  source,
  lat,
  lng,
});

describe('mergeSuggestions', () => {
  it('MAPS-SUGMERGE-001: interleaves the two, the index leading', () => {
    const index = [
      row('gers:a', 'Café Kranzler', 52.5, 13.33, 'trek-places'),
      row('gers:b', 'Café Central', 52.6, 13.4, 'trek-places'),
    ];
    const photon = [
      row('way:1', 'Kranzler Eck', 52.503, 13.333, 'openstreetmap'),
      row('node:2', 'Kranzlersee', 53, 13, 'openstreetmap'),
    ];

    expect(mergeSuggestions(index, photon).map((s) => s.placeId)).toEqual(['gers:a', 'way:1', 'gers:b', 'node:2']);
  });

  it("MAPS-SUGMERGE-002: drops Photon's copy of an element the layer already listed", () => {
    const index = [row('node:9712313', 'Tokio Hauptbahnhof', 35.6811816, 139.76598265, 'openstreetmap')];
    // Photon names it in a different language, so only the id says it is one place.
    const photon = [row('node:9712313', 'Tokyo Station', 35.6812, 139.7671, 'openstreetmap')];

    expect(mergeSuggestions(index, photon)).toEqual(index);
  });

  it('MAPS-SUGMERGE-003: drops a Photon row for a place the index lists by the search-list rule', () => {
    const index = [row('gers:a', 'Brandenburger Tor', 52.5163, 13.3777, 'trek-places')];
    const photon = [
      row('way:518071791', 'Brandenburger Tor', 52.51628, 13.37771, 'openstreetmap'),
      row('node:3', 'Hotel Adlon', 52.5164, 13.3779, 'openstreetmap'),
    ];

    // The hotel next to the gate shares the spot and nothing else, so it stays.
    expect(mergeSuggestions(index, photon).map((s) => s.placeId)).toEqual(['gers:a', 'node:3']);
  });

  it('MAPS-SUGMERGE-004: stops at the limit, and answers from Photon alone when the index found nothing', () => {
    const photon = Array.from({ length: 10 }, (_, i) => row(`node:${i}`, `Place ${i}`, i, i, 'openstreetmap'));

    expect(mergeSuggestions([], photon)).toHaveLength(8);
    expect(mergeSuggestions([], photon, 3).map((s) => s.placeId)).toEqual(['node:0', 'node:1', 'node:2']);
  });
});
