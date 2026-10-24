/**
 * The files users attach in the trip chat, kept with the conversation: the
 * bytes go to storage before the turn writes anything, the text TREK reads
 * stays in the row and never fails the turn, a thread's bytes go with it, and
 * the nightly sweep removes the week-old ones and the bytes no row names.
 */
import { AssistantAttachments } from '../../../../src/db/entities/AssistantAttachments.entity';
import {
  ASSISTANT_ATTACHMENT_TTL_DAYS,
  AssistantAttachmentsService,
} from '../../../../src/nest/assistant/assistant-attachments.service';
import { LlmParseService } from '../../../../src/nest/llm-parse/llm-parse.service';
import { StorageService } from '../../../../src/nest/storage/storage.service';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { Test } from '@nestjs/testing';

import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';

const logMock = vi.hoisted(() => ({ logInfo: vi.fn(), logError: vi.fn(), logWarn: vi.fn(), logDebug: vi.fn() }));
vi.mock('../../../../src/nest/audit/audit-log.logger', () => logMock);

const NOW = new Date('2026-10-24T03:45:00.000Z');
const HOUR = 60 * 60_000;

function file(name: string, content = 'Booking ABC123', mimetype = 'application/pdf'): Express.Multer.File {
  const buffer = Buffer.from(content);
  return { originalname: name, buffer, size: buffer.length, mimetype } as Express.Multer.File;
}

interface Listed {
  key: string;
  mtimeMs: number;
}

async function make(opts: { text?: string | Error; listed?: Listed[]; failDelete?: string; failPut?: boolean } = {}) {
  const rows = {
    insertAttachment: vi.fn(async () => undefined),
    listForThread: vi.fn(async () => []),
    listObjectsOfThread: vi.fn(async () => [{ id: 'a1', storage_key: 'assistant/a1.pdf' }]),
    listCreatedBefore: vi.fn(async () => [
      { id: 'old1', storage_key: 'assistant/old1.pdf' },
      { id: 'old2', storage_key: 'assistant/old2.pdf' },
    ]),
    deleteByIds: vi.fn(async (ids: string[]) => ids.length),
    listKnownKeys: vi.fn(async (keys: string[]) => keys.filter((key) => key.startsWith('assistant/kept'))),
  };
  const put = vi.fn(async (_category: string, _key: string, source: Readable) => {
    if (opts.failPut) throw new Error('bucket is gone');
    for await (const _chunk of source) {
      // drained, as a driver would
    }
  });
  const storage = {
    put,
    delete: vi.fn(async (_category: string, key: string) => {
      if (key === opts.failDelete) throw new Error('permission denied');
    }),
    list: vi.fn(async function* list() {
      for (const entry of opts.listed ?? []) yield { key: entry.key, size: 1, mtimeMs: entry.mtimeMs };
    }),
  };
  const llmParse = {
    readText: vi.fn(async () => {
      if (opts.text instanceof Error) throw opts.text;
      return opts.text ?? ' Booking ABC123 ';
    }),
  };
  const moduleRef = await Test.createTestingModule({
    providers: [
      AssistantAttachmentsService,
      { provide: getRepositoryToken(AssistantAttachments), useValue: rows },
      { provide: StorageService, useValue: storage },
      { provide: LlmParseService, useValue: llmParse },
    ],
  }).compile();
  return { service: moduleRef.get(AssistantAttachmentsService), rows, storage, llmParse };
}

describe('AssistantAttachmentsService', () => {
  it('ASTATT-001: keeps the bytes under the attachments folder and reads the text, before any row is written', async () => {
    const t = await make();
    const kept = await t.service.prepare(file('AirBnB Buchung.pdf'), 'AirBnB Buchung.pdf');
    expect(kept).toMatchObject({
      name: 'AirBnB Buchung.pdf',
      mime: 'application/pdf',
      size: 14,
      text: 'Booking ABC123',
      textStatus: 'ok',
    });
    expect(kept.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(kept.storageKey).toBe(`assistant/${kept.id}.pdf`);
    expect(kept.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(t.storage.put).toHaveBeenCalledWith('files', kept.storageKey, expect.any(Readable), {
      contentType: 'application/pdf',
    });
    expect(t.rows.insertAttachment).not.toHaveBeenCalled();
  });

  it('ASTATT-002: a storage that refuses the bytes refuses the turn', async () => {
    const t = await make({ failPut: true });
    await expect(t.service.prepare(file('a.pdf'), 'a.pdf')).rejects.toThrow('bucket is gone');
  });

  it('ASTATT-003: says how reading the text went, and a failure never fails the file', async () => {
    const statusOf = async (name: string, text?: string | Error) => {
      const t = await make({ text });
      return (await t.service.prepare(file(name), name)).textStatus;
    };
    expect(await statusOf('scan.pdf', '   ')).toBe('scanned');
    expect(await statusOf('empty.txt', '')).toBe('empty');
    expect(await statusOf('broken.pdf', new Error('bad xref'))).toBe('failed');
    expect(await statusOf('photo.JPG')).toBe('unsupported');
    expect(await statusOf('pass.pkpass')).toBe('unsupported');
    expect(logMock.logError).toHaveBeenCalledWith(expect.stringContaining('bad xref'));
  });

  it('ASTATT-004: a name with an odd extension gets a plain key, and a long text is kept to its cap', async () => {
    const t = await make({ text: 'x'.repeat(250_000) });
    const kept = await t.service.prepare(file('ticket.p d f'), 'ticket.p d f');
    expect(kept.storageKey).toBe(`assistant/${kept.id}`);
    expect(kept.text).toHaveLength(200_000);
  });

  it('ASTATT-005: records the row in the thread the turn opened, and drops the bytes of a turn that never began', async () => {
    const t = await make();
    const kept = await t.service.prepare(file('a.pdf'), 'a.pdf');
    await t.service.record(kept, { threadId: 4, userId: 7, tripId: 9 });
    expect(t.rows.insertAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ id: kept.id, threadId: 4, userId: 7, tripId: 9, storageKey: kept.storageKey }),
    );
    await t.service.discard(kept);
    expect(t.storage.delete).toHaveBeenCalledWith('files', kept.storageKey);
  });

  it('ASTATT-006: a deleted thread takes its bytes along; one that cannot go now is left for the sweep', async () => {
    const t = await make({ failDelete: 'assistant/a1.pdf' });
    const objects = await t.service.objectsOfThread(4, 7);
    expect(t.rows.listObjectsOfThread).toHaveBeenCalledWith(4, 7);
    await expect(t.service.dropObjects(objects)).resolves.toBeUndefined();
    expect(logMock.logError).toHaveBeenCalledWith(expect.stringContaining('assistant/a1.pdf'));
  });

  it(`ASTATT-007: the sweep removes what is ${ASSISTANT_ATTACHMENT_TTL_DAYS} days old, bytes first, then loose bytes`, async () => {
    const t = await make({
      failDelete: 'assistant/old2.pdf',
      listed: [
        { key: 'assistant/kept.pdf', mtimeMs: NOW.getTime() - 3 * HOUR },
        { key: 'assistant/loose.pdf', mtimeMs: NOW.getTime() - 3 * HOUR },
        { key: 'assistant/fresh.pdf', mtimeMs: NOW.getTime() - 60_000 },
      ],
    });
    const swept = await t.service.sweep(NOW);
    expect(t.rows.listCreatedBefore).toHaveBeenCalledWith('2026-10-17 03:45:00', 500);
    // The row whose bytes could not be deleted stays, so it can be tried again.
    expect(t.rows.deleteByIds).toHaveBeenCalledWith(['old1']);
    expect(t.rows.listKnownKeys).toHaveBeenCalledWith(['assistant/kept.pdf', 'assistant/loose.pdf']);
    expect(t.storage.delete).toHaveBeenCalledWith('files', 'assistant/loose.pdf');
    expect(t.storage.delete).not.toHaveBeenCalledWith('files', 'assistant/kept.pdf');
    expect(t.storage.delete).not.toHaveBeenCalledWith('files', 'assistant/fresh.pdf');
    expect(swept).toEqual({ expired: 1, orphaned: 1 });
    expect(logMock.logInfo).toHaveBeenCalledWith(
      'Assistant retention: removed 1 attached file(s) and 1 loose object(s)',
    );
  });

  it('ASTATT-008: lists a thread for the user only', async () => {
    const t = await make();
    await t.service.listForThread(4, 7);
    expect(t.rows.listForThread).toHaveBeenCalledWith(4, 7);
  });
});
