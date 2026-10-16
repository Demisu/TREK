import { open } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';

/**
 * A reader for OpenStreetMap's PBF format, as Geofabrik's regional extracts
 * come: the file is a run of blobs, each a length-prefixed header and a
 * (usually zlib-compressed) block. A block holds its own string table and
 * groups of nodes (packed as "dense" nodes) and ways. Relations are not read:
 * every object PAD-05A evaluates is a node or a way.
 *
 * Only what the paddle data needs is decoded, and nothing is kept between
 * blocks, so a region of any size is read in the memory of one block (a few
 * megabytes). The format: https://wiki.openstreetmap.org/wiki/PBF_Format
 */

/** A blob's size may not exceed this, by the format's own rule. */
const MAX_BLOB_BYTES = 32 * 1024 * 1024;
const MAX_HEADER_BYTES = 64 * 1024;

export interface OsmNode {
  id: number;
  lat: number;
  lon: number;
  tags: Record<string, string>;
}

export interface OsmWay {
  id: number;
  refs: number[];
  tags: Record<string, string>;
}

export interface OsmBlockVisitor {
  /** Every node of the block, tagged or not; `tags` is empty for most. */
  node?: (node: OsmNode) => void;
  way?: (way: OsmWay) => void;
}

/** A protobuf field walker over one buffer, enough for the OSM schema. */
class Proto {
  pos: number;

  constructor(
    private readonly buf: Buffer,
    start = 0,
    private readonly end = buf.length,
  ) {
    this.pos = start;
  }

  get done(): boolean {
    return this.pos >= this.end;
  }

  /** An unsigned varint as a number: exact up to 2^53, which every OSM id and offset stays under. */
  varint(): number {
    let result = 0;
    let scale = 1;
    for (;;) {
      if (this.pos >= this.end) throw new Error('Truncated varint');
      const byte = this.buf[this.pos++] as number;
      result += (byte & 0x7f) * scale;
      if (byte < 0x80) return result;
      scale *= 128;
    }
  }

  /** A zigzag-encoded signed varint. */
  svarint(): number {
    const raw = this.varint();
    return raw % 2 === 0 ? raw / 2 : -(raw + 1) / 2;
  }

  /** The next field's number and wire type, or null at the end. */
  key(): { field: number; wire: number } | null {
    if (this.done) return null;
    const key = this.varint();
    return { field: Math.floor(key / 8), wire: key % 8 };
  }

  /** The bounds of a length-delimited field, consumed. */
  span(): [number, number] {
    const length = this.varint();
    const start = this.pos;
    this.pos += length;
    if (this.pos > this.end) throw new Error('Truncated field');
    return [start, this.pos];
  }

  bytes(): Buffer {
    const [start, stop] = this.span();
    return this.buf.subarray(start, stop);
  }

  skip(wire: number): void {
    if (wire === 0) this.varint();
    else if (wire === 1) this.pos += 8;
    else if (wire === 2) this.span();
    else if (wire === 5) this.pos += 4;
    else throw new Error(`Unsupported wire type ${wire}`);
  }

  /** A packed field of varints (or zigzag varints), decoded whole. */
  packed(signed: boolean): number[] {
    const [start, stop] = this.span();
    const inner = new Proto(this.buf, start, stop);
    const values: number[] = [];
    while (!inner.done) values.push(signed ? inner.svarint() : inner.varint());
    return values;
  }
}

/** The fields of a blob header: its type ("OSMHeader" or "OSMData") and the size of the blob after it. */
function readBlobHeader(buf: Buffer): { type: string; size: number } {
  const p = new Proto(buf);
  let type = '';
  let size = 0;
  for (let key = p.key(); key; key = p.key()) {
    if (key.field === 1 && key.wire === 2) type = p.bytes().toString('utf8');
    else if (key.field === 3 && key.wire === 0) size = p.varint();
    else p.skip(key.wire);
  }
  return { type, size };
}

/** A blob's contents, inflated: the format allows raw or zlib data, and TREK reads those two. */
function readBlob(buf: Buffer): Buffer {
  const p = new Proto(buf);
  let raw: Buffer | null = null;
  let zlib: Buffer | null = null;
  for (let key = p.key(); key; key = p.key()) {
    if (key.field === 1 && key.wire === 2) raw = p.bytes();
    else if (key.field === 3 && key.wire === 2) zlib = p.bytes();
    else p.skip(key.wire);
  }
  if (raw) return raw;
  if (zlib) return inflateSync(zlib, { maxOutputLength: MAX_BLOB_BYTES });
  throw new Error('Unsupported blob compression');
}

/**
 * The replication timestamp of an extract, from its header block: the moment
 * the data is current to, in seconds. Null when the header carries none.
 */
export function readHeaderTimestamp(block: Buffer): number | null {
  const p = new Proto(block);
  for (let key = p.key(); key; key = p.key()) {
    if (key.field === 32 && key.wire === 0) return p.varint();
    p.skip(key.wire);
  }
  return null;
}

interface BlockContext {
  strings: string[];
  granularity: number;
  latOffset: number;
  lonOffset: number;
}

function tagsOf(keys: readonly number[], values: readonly number[], strings: readonly string[]): Record<string, string> {
  const tags: Record<string, string> = {};
  keys.forEach((key, index) => {
    const value = values[index];
    if (value !== undefined) tags[strings[key] ?? ''] = strings[value] ?? '';
  });
  return tags;
}

function readDense(buf: Buffer, ctx: BlockContext, visit: (node: OsmNode) => void): void {
  const p = new Proto(buf);
  let ids: number[] = [];
  let lats: number[] = [];
  let lons: number[] = [];
  let keysVals: number[] = [];
  for (let key = p.key(); key; key = p.key()) {
    if (key.field === 1) ids = p.packed(true);
    else if (key.field === 8) lats = p.packed(true);
    else if (key.field === 9) lons = p.packed(true);
    else if (key.field === 10) keysVals = p.packed(false);
    else p.skip(key.wire);
  }
  let id = 0;
  let lat = 0;
  let lon = 0;
  let kv = 0;
  ids.forEach((delta, index) => {
    id += delta;
    lat += lats[index] ?? 0;
    lon += lons[index] ?? 0;
    const tags: Record<string, string> = {};
    // keys_vals runs key, value, key, value ... with a 0 closing each node.
    while (kv < keysVals.length && keysVals[kv] !== 0) {
      tags[ctx.strings[keysVals[kv] as number] ?? ''] = ctx.strings[keysVals[kv + 1] as number] ?? '';
      kv += 2;
    }
    kv += 1;
    visit({
      id,
      lat: (ctx.latOffset + ctx.granularity * lat) * 1e-9,
      lon: (ctx.lonOffset + ctx.granularity * lon) * 1e-9,
      tags,
    });
  });
}

function readNode(buf: Buffer, ctx: BlockContext): OsmNode {
  const p = new Proto(buf);
  let id = 0;
  let lat = 0;
  let lon = 0;
  let keys: number[] = [];
  let values: number[] = [];
  for (let key = p.key(); key; key = p.key()) {
    if (key.field === 1) id = p.svarint();
    else if (key.field === 2) keys = p.packed(false);
    else if (key.field === 3) values = p.packed(false);
    else if (key.field === 8) lat = p.svarint();
    else if (key.field === 9) lon = p.svarint();
    else p.skip(key.wire);
  }
  return {
    id,
    lat: (ctx.latOffset + ctx.granularity * lat) * 1e-9,
    lon: (ctx.lonOffset + ctx.granularity * lon) * 1e-9,
    tags: tagsOf(keys, values, ctx.strings),
  };
}

function readWay(buf: Buffer, strings: readonly string[]): OsmWay {
  const p = new Proto(buf);
  let id = 0;
  let keys: number[] = [];
  let values: number[] = [];
  let deltas: number[] = [];
  for (let key = p.key(); key; key = p.key()) {
    if (key.field === 1) id = p.varint();
    else if (key.field === 2) keys = p.packed(false);
    else if (key.field === 3) values = p.packed(false);
    else if (key.field === 8) deltas = p.packed(true);
    else p.skip(key.wire);
  }
  let ref = 0;
  const refs = deltas.map((delta) => (ref += delta));
  return { id, refs, tags: tagsOf(keys, values, strings) };
}

/** One data block: its string table, then each group's nodes and ways handed to the visitor. */
export function readDataBlock(block: Buffer, visitor: OsmBlockVisitor): void {
  const p = new Proto(block);
  const strings: string[] = [];
  const groups: Buffer[] = [];
  const ctx: BlockContext = { strings, granularity: 100, latOffset: 0, lonOffset: 0 };
  for (let key = p.key(); key; key = p.key()) {
    if (key.field === 1 && key.wire === 2) {
      const table = new Proto(p.bytes());
      for (let entry = table.key(); entry; entry = table.key()) {
        if (entry.field === 1 && entry.wire === 2) strings.push(table.bytes().toString('utf8'));
        else table.skip(entry.wire);
      }
    } else if (key.field === 2 && key.wire === 2) groups.push(p.bytes());
    else if (key.field === 17 && key.wire === 0) ctx.granularity = p.varint();
    else if (key.field === 19 && key.wire === 0) ctx.latOffset = p.svarint();
    else if (key.field === 20 && key.wire === 0) ctx.lonOffset = p.svarint();
    else p.skip(key.wire);
  }
  for (const group of groups) {
    const g = new Proto(group);
    for (let key = g.key(); key; key = g.key()) {
      if (key.field === 1 && key.wire === 2 && visitor.node) visitor.node(readNode(g.bytes(), ctx));
      else if (key.field === 2 && key.wire === 2 && visitor.node) readDense(g.bytes(), ctx, visitor.node);
      else if (key.field === 3 && key.wire === 2 && visitor.way) visitor.way(readWay(g.bytes(), strings));
      else g.skip(key.wire);
    }
  }
}

/**
 * Every block of a PBF file in order, read from disk one at a time. The
 * header block is answered with its timestamp; data blocks go to the visitor.
 * `onBlock` is told the bytes read so far, for progress and to give way to
 * other work between blocks.
 */
export async function readPbfFile(
  path: string,
  visitor: OsmBlockVisitor,
  onBlock?: (bytesRead: number) => Promise<void> | void,
): Promise<{ timestamp: number | null }> {
  const file = await open(path, 'r');
  let timestamp: number | null = null;
  try {
    let offset = 0;
    const lengthBuf = Buffer.alloc(4);
    for (;;) {
      const { bytesRead } = await file.read(lengthBuf, 0, 4, offset);
      if (bytesRead === 0) break;
      if (bytesRead < 4) throw new Error('Truncated blob length');
      const headerLength = lengthBuf.readUInt32BE(0);
      if (headerLength > MAX_HEADER_BYTES) throw new Error('Blob header too large');
      const headerBuf = Buffer.alloc(headerLength);
      await file.read(headerBuf, 0, headerLength, offset + 4);
      const header = readBlobHeader(headerBuf);
      if (header.size > MAX_BLOB_BYTES) throw new Error('Blob too large');
      const blobBuf = Buffer.alloc(header.size);
      const read = await file.read(blobBuf, 0, header.size, offset + 4 + headerLength);
      if (read.bytesRead < header.size) throw new Error('Truncated blob');
      const block = readBlob(blobBuf);
      if (header.type === 'OSMHeader') timestamp = readHeaderTimestamp(block);
      else if (header.type === 'OSMData') readDataBlock(block, visitor);
      offset += 4 + headerLength + header.size;
      await onBlock?.(offset);
    }
  } finally {
    await file.close();
  }
  return { timestamp };
}
