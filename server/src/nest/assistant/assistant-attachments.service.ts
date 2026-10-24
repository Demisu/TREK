import { AssistantAttachments } from '../../db/entities/AssistantAttachments.entity';
import type {
  AssistantAttachmentObject,
  AssistantAttachmentsRepository,
  AssistantAttachmentSummary,
  AssistantAttachmentTextStatus,
} from '../../db/repositories/AssistantAttachments.repository';
import { dbNow } from '../../db/types';
import { logError, logInfo } from '../audit/audit-log.logger';
import { LlmParseService } from '../llm-parse/llm-parse.service';
import { StorageService } from '../storage/storage.service';
import { InjectRepository } from '@mikro-orm/nestjs';
import { Injectable } from '@nestjs/common';
import { LLM_PHOTO_EXTENSIONS } from '@trek/shared';

import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { Readable } from 'node:stream';

/** How long an attached file is kept with its conversation. */
export const ASSISTANT_ATTACHMENT_TTL_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Where the bytes sit: under the trip files' category, which is never served
 * by path (`/uploads/files` refuses every request), in a folder of their own.
 */
const STORAGE_CATEGORY = 'files';
const KEY_PREFIX = 'assistant/';

/** The most text kept of one file; a model is sent a window of it, never all of it. */
const MAX_STORED_TEXT_CHARS = 200_000;

/** Rows one sweep pass takes; the next night takes the rest. */
const SWEEP_BATCH = 500;

/** Bytes put moments ago may belong to a turn whose row is not written yet; the sweep leaves them for an hour. */
const ORPHAN_GRACE_MS = 60 * 60_000;

/** Files whose bytes hold no text TREK reads: photos, and the zipped wallet passes. */
const UNREAD_EXTENSIONS: ReadonlySet<string> = new Set([...LLM_PHOTO_EXTENSIONS, '.pkpass']);

/** A file stored for a turn that has not written its rows yet. */
export interface PreparedAttachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  sha256: string;
  storageKey: string;
  text: string | null;
  textStatus: AssistantAttachmentTextStatus;
}

/** A plain extension of a file name for its storage key, or none when the name carries something else. */
function keyExtension(name: string): string {
  const ext = extname(name).toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(ext) ? ext : '';
}

/**
 * The files users attach in the trip chat, kept with the conversation
 * (`assistant_attachments`): the bytes in storage, the text TREK read out of
 * them in the row. The text stays on the server; it reaches the model only
 * where the user agreed for that one file, and never a message part.
 */
@Injectable()
export class AssistantAttachmentsService {
  constructor(
    @InjectRepository(AssistantAttachments) private readonly rows: AssistantAttachmentsRepository,
    private readonly storage: StorageService,
    private readonly llmParse: LlmParseService,
  ) {}

  /**
   * Puts the file's bytes into storage and reads its text, before the turn
   * writes anything: a storage that refuses the bytes refuses the turn. A file
   * whose text cannot be read is kept all the same, as `failed`.
   */
  async prepare(file: Express.Multer.File, name: string): Promise<PreparedAttachment> {
    const id = randomUUID();
    const storageKey = `${KEY_PREFIX}${id}${keyExtension(name)}`;
    const mime = file.mimetype || 'application/octet-stream';
    await this.storage.put(STORAGE_CATEGORY, storageKey, Readable.from([file.buffer]), { contentType: mime });
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    return { id, name, mime, size: file.size, sha256, storageKey, ...(await this.textOf(file.buffer, name)) };
  }

  /** The row of a prepared file, in the thread its turn opened; written inside the turn's opening transaction. */
  async record(prepared: PreparedAttachment, at: { threadId: number; userId: number; tripId: number }): Promise<void> {
    await this.rows.insertAttachment({
      id: prepared.id,
      threadId: at.threadId,
      userId: at.userId,
      tripId: at.tripId,
      name: prepared.name,
      mime: prepared.mime,
      size: prepared.size,
      sha256: prepared.sha256,
      storageKey: prepared.storageKey,
      text: prepared.text,
      textStatus: prepared.textStatus,
      createdAt: dbNow(),
    });
  }

  /** The bytes of a file whose turn never began; the sweep would find them otherwise, a night later. */
  async discard(prepared: PreparedAttachment): Promise<void> {
    await this.deleteObject(prepared.storageKey);
  }

  /** The user's attachments in a thread, without their text. */
  listForThread(threadId: number, userId: number): Promise<AssistantAttachmentSummary[]> {
    return this.rows.listForThread(threadId, userId);
  }

  /** Where the bytes of a thread's attachments sit, read before the thread is deleted. */
  objectsOfThread(threadId: number, userId: number): Promise<AssistantAttachmentObject[]> {
    return this.rows.listObjectsOfThread(threadId, userId);
  }

  /**
   * Deletes the bytes of a thread that is gone; its rows went with it. An
   * object that cannot be deleted now is left for the sweep.
   */
  async dropObjects(objects: readonly AssistantAttachmentObject[]): Promise<void> {
    await Promise.all(objects.map((object) => this.deleteObject(object.storage_key)));
  }

  /**
   * The nightly sweep: attachments older than the TTL (bytes first, then the
   * row, so no row ever names bytes that are gone), then bytes no row names
   * any more (a thread or a user deleted with its rows, a turn that never
   * began). Answers how many attachments and loose objects went.
   *
   * @txIndependent a retention sweep in passes: each object is deleted from
   * storage on its own, and a row only after its bytes.
   */
  async sweep(now: Date = new Date()): Promise<{ expired: number; orphaned: number }> {
    const cutoff = dbNow(new Date(now.getTime() - ASSISTANT_ATTACHMENT_TTL_DAYS * DAY_MS));
    const old = await this.rows.listCreatedBefore(cutoff, SWEEP_BATCH);
    const gone = await Promise.all(
      old.map(async (row) => ((await this.deleteObject(row.storage_key)) ? row.id : null)),
    );
    const expired = await this.rows.deleteByIds(gone.filter((id): id is string => id !== null));
    const orphaned = await this.sweepOrphans(now);
    if (expired + orphaned > 0) {
      logInfo(`Assistant retention: removed ${expired} attached file(s) and ${orphaned} loose object(s)`);
    }
    return { expired, orphaned };
  }

  /** Objects under the attachments' folder that no row names, older than the grace period. */
  private async sweepOrphans(now: Date): Promise<number> {
    const listed: string[] = [];
    for await (const stat of this.storage.list(STORAGE_CATEGORY, KEY_PREFIX)) {
      if (now.getTime() - stat.mtimeMs > ORPHAN_GRACE_MS) listed.push(stat.key);
    }
    const pages = Array.from({ length: Math.ceil(listed.length / SWEEP_BATCH) }, (_page, i) =>
      listed.slice(i * SWEEP_BATCH, (i + 1) * SWEEP_BATCH),
    );
    // One page after another, so a large backlog never asks the database for all its keys at once.
    return pages.reduce<Promise<number>>(async (previous, page) => {
      const done = await previous;
      const known = new Set(await this.rows.listKnownKeys(page));
      const deleted = await Promise.all(page.filter((key) => !known.has(key)).map((key) => this.deleteObject(key)));
      return done + deleted.filter(Boolean).length;
    }, Promise.resolve(0));
  }

  /** Deletes one object; a failure is logged and answered as false, the next sweep tries again. */
  private async deleteObject(key: string): Promise<boolean> {
    try {
      await this.storage.delete(STORAGE_CATEGORY, key);
      return true;
    } catch (err) {
      logError(
        `[assistant] could not delete attached file ${key}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  /** The text TREK reads out of a file, and how that went. Never throws. */
  private async textOf(
    buffer: Buffer,
    name: string,
  ): Promise<{ text: string | null; textStatus: AssistantAttachmentTextStatus }> {
    const ext = extname(name).toLowerCase();
    if (UNREAD_EXTENSIONS.has(ext)) return { text: null, textStatus: 'unsupported' };
    try {
      const text = (await this.llmParse.readText(buffer, name)).trim();
      if (text) return { text: text.slice(0, MAX_STORED_TEXT_CHARS), textStatus: 'ok' };
      return { text: null, textStatus: ext === '.pdf' ? 'scanned' : 'empty' };
    } catch (err) {
      logError(`[assistant] could not read the text of ${name}: ${err instanceof Error ? err.message : String(err)}`);
      return { text: null, textStatus: 'failed' };
    }
  }
}
