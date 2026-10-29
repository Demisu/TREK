/**
 * PHOTON-MAP-001..016: Photon's answers read into the shape Nominatim gives,
 * the rows of the suggestion list, and the language Photon is asked in.
 */
import {
  asNominatimHit,
  asNominatimReverse,
  asSuggestion,
  photonAnswerSchema,
  photonDisplayName,
  photonLang,
  type PhotonFeature,
} from '../../../src/nest/maps/providers/photon.mapping';
import { gateFeature } from '../../helpers/photon';

import { describe, expect, it } from 'vitest';

const feature = (properties: Record<string, unknown> = {}): PhotonFeature =>
  photonAnswerSchema.parse({ features: [gateFeature(properties)] }).features[0];

describe('photonLang', () => {
  it('PHOTON-MAP-001: asks in the languages the import holds names for', () => {
    expect(photonLang('de')).toBe('de');
    expect(photonLang('en')).toBe('en');
    expect(photonLang('ja')).toBe('ja');
  });

  it("PHOTON-MAP-002: reads TREK's own codes through toApiLang first", () => {
    expect(photonLang('br')).toBe('pt');
    expect(photonLang('gr')).toBe('el');
  });

  it('PHOTON-MAP-003: drops the region, whatever its case', () => {
    expect(photonLang('pt-BR')).toBe('pt');
    expect(photonLang('zh-TW')).toBe('zh');
    expect(photonLang('EN-gb')).toBe('en');
  });

  it('PHOTON-MAP-004: asks for the names on the spot in a language without names, and without one', () => {
    expect(photonLang('eo')).toBe('default');
    expect(photonLang('xx-YY')).toBe('default');
    expect(photonLang(undefined)).toBe('default');
    expect(photonLang('  ')).toBe('default');
  });
});

describe('photonDisplayName', () => {
  it('PHOTON-MAP-005: names the place, then house number and street as Nominatim does, quarter, town, region, postcode and country', () => {
    expect(photonDisplayName(feature({ housenumber: '1' }).properties)).toBe(
      'Brandenburger Tor, 1, Pariser Platz, Mitte, Berlin, 10117, Deutschland',
    );
  });

  it('PHOTON-MAP-013: writes an address without a name the way Nominatim writes a house', () => {
    const house = feature({ name: undefined, housenumber: '77', street: 'Unter den Linden', postcode: undefined });
    expect(photonDisplayName(house.properties)).toBe('77, Unter den Linden, Mitte, Berlin, Deutschland');
  });

  it('PHOTON-MAP-006: leaves out what is missing and what repeats', () => {
    const city = feature({ name: 'Berlin', street: undefined, district: undefined, postcode: undefined, type: 'city' });
    expect(photonDisplayName(city.properties)).toBe('Berlin, Deutschland');
  });
});

describe('asNominatimHit', () => {
  it('PHOTON-MAP-007: spells the hit the way a Nominatim search row is spelt', () => {
    expect(asNominatimHit(feature())).toEqual({
      osm_type: 'way',
      osm_id: '518071791',
      class: 'tourism',
      type: 'attraction',
      name: 'Brandenburger Tor',
      display_name: 'Brandenburger Tor, Pariser Platz, Mitte, Berlin, 10117, Deutschland',
      lat: '52.5163',
      lon: '13.3777',
      extratags: { wikidata: 'Q82425', wikipedia: 'de:Brandenburger Tor' },
    });
  });

  it('PHOTON-MAP-008: names nodes and relations in full, and keeps only text tags', () => {
    expect(asNominatimHit(feature({ osm_type: 'N' }))?.osm_type).toBe('node');
    expect(asNominatimHit(feature({ osm_type: 'R' }))?.osm_type).toBe('relation');
    expect(asNominatimHit(feature({ extra: { wikidata: 'Q1', capacity: 12 } }))?.extratags).toEqual({ wikidata: 'Q1' });
    expect(asNominatimHit(feature({ extra: undefined }))?.extratags).toBeNull();
  });

  it('PHOTON-MAP-009: has nothing for a hit without an OpenStreetMap id', () => {
    expect(asNominatimHit(feature({ osm_type: undefined }))).toBeNull();
    expect(asNominatimHit(feature({ osm_type: 'X' }))).toBeNull();
    expect(asNominatimHit(feature({ osm_id: undefined }))).toBeNull();
  });
});

describe('asNominatimReverse', () => {
  it('PHOTON-MAP-010: fills the address fields Nominatim fills, the sight under its main tag', () => {
    expect(asNominatimReverse(feature({ housenumber: '1' }))).toEqual({
      display_name: 'Brandenburger Tor, 1, Pariser Platz, Mitte, Berlin, 10117, Deutschland',
      name: 'Brandenburger Tor',
      address: {
        road: 'Pariser Platz',
        house_number: '1',
        postcode: '10117',
        suburb: 'Mitte',
        city: 'Berlin',
        state: 'Berlin',
        country: 'Deutschland',
        country_code: 'de',
        tourism: 'Brandenburger Tor',
      },
    });
  });

  it('PHOTON-MAP-011: makes a town its own city and files nothing more under its tag', () => {
    const town = feature({ name: 'Warnemünde', type: 'city', osm_key: 'place', city: undefined, street: undefined });
    const reverse = asNominatimReverse(town);
    expect(reverse.address?.city).toBe('Warnemünde');
    expect(reverse.address).not.toHaveProperty('place');
  });

  it('PHOTON-MAP-012: a feature with nothing to name has no display name', () => {
    const bare = photonAnswerSchema.parse({ features: [{ geometry: { coordinates: [0, 0] }, properties: {} }] });
    expect(asNominatimReverse(bare.features[0])).toEqual({ display_name: undefined, name: undefined, address: {} });
  });
});

describe('asSuggestion', () => {
  it('PHOTON-MAP-014: titles the row by its name, with where it is below, in the id form the details lookup reads', () => {
    expect(asSuggestion(feature())).toEqual({
      placeId: 'way:518071791',
      mainText: 'Brandenburger Tor',
      secondaryText: 'Pariser Platz, Mitte, Berlin, 10117, Deutschland',
      source: 'openstreetmap',
      lat: 52.5163,
      lng: 13.3777,
    });
  });

  it('PHOTON-MAP-015: keeps a name that holds a comma whole, and titles a house without one by its number', () => {
    const bar = asSuggestion(feature({ name: 'Bar, Café Einstein' }));
    expect(bar?.mainText).toBe('Bar, Café Einstein');
    expect(bar?.secondaryText).toBe('Pariser Platz, Mitte, Berlin, 10117, Deutschland');

    const house = asSuggestion(
      feature({ name: undefined, housenumber: '77', street: 'Unter den Linden', postcode: undefined }),
    );
    expect(house?.mainText).toBe('77');
    expect(house?.secondaryText).toBe('Unter den Linden, Mitte, Berlin, Deutschland');
  });

  it('PHOTON-MAP-016: has no row for a hit without an id or anything to call it', () => {
    expect(asSuggestion(feature({ osm_id: undefined }))).toBeNull();
    const bare = photonAnswerSchema.parse({
      features: [{ geometry: { coordinates: [13.4, 52.5] }, properties: { osm_type: 'N', osm_id: 1 } }],
    });
    expect(asSuggestion(bare.features[0])).toBeNull();
  });
});
