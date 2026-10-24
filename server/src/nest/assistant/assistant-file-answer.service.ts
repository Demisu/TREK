import { logError } from '../audit/audit-log.logger';
import { withRequestContext } from '../database/request-context';
import type { HeldCall } from './assistant-agent';
import type { AttachedFileReader, FileRead } from './assistant-attached-file';
import { todayIn } from './assistant-context';
import { AssistantToolsService } from './assistant-tools.service';
import { readTripCard } from './assistant-trip-scope';
import { AssistantCardContext } from './cards/card-context';
import type { UiStreamWriter } from './ui-stream.writer';
import { MikroORM } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import type { AssistantClientCtx, AssistantMessagePart } from '@trek/shared';

import { randomUUID } from 'node:crypto';

/** What the read step of an attached file answers when the file could not be read. */
const FILE_UNREADABLE = 'The file could not be read.';

/** The turn a file was attached in: who, on which trip, the thread and the answer's first row. */
export interface FileTurn extends AssistantClientCtx {
  userId: number;
  tripId: number;
  threadId: number;
  rowId: number;
  name: string;
}

/** How the answer's row is written: AssistantService's, which owns the rows and their transactions. */
export interface FileAnswerRows {
  save(parts: AssistantMessagePart[], status: 'complete' | 'aborted' | 'error'): Promise<void>;
  /** Saves the row waiting for the user, together with the changes it holds. */
  hold(parts: AssistantMessagePart[], held: HeldCall[]): Promise<void>;
}

/** Where the answer goes: the stream, the signal that the client went away, and the row. */
export interface FileAnswerOut {
  w: UiStreamWriter;
  signal: AbortSignal;
  rows: FileAnswerRows;
}

/**
 * The answer to a file the user attached in the trip chat, written by the
 * server itself, in the answer's first row: the read step, then one held
 * change per booking (`import_booking`) or track (`import_tour_file`), each
 * with its card. No model is asked.
 */
@Injectable()
export class AssistantFileAnswers {
  constructor(
    private readonly tools: AssistantToolsService,
    private readonly cardContext: AssistantCardContext,
    private readonly orm: MikroORM,
  ) {}

  /**
   * Reads the attached file and proposes what it found. A file without any
   * ends the answer with the reader's code; one that cannot be read, with
   * `generic`.
   *
   * @txIndependent the row is written once the file was read, in a
   * transaction of its own.
   */
  async answer(turn: FileTurn, file: Express.Multer.File, reader: AttachedFileReader, out: FileAnswerOut) {
    const { w, signal, rows } = out;
    const readId = randomUUID();
    const readArgs = { name: turn.name };
    const readPart = (result: unknown, isError = false): AssistantMessagePart => ({
      type: 'tool-call',
      toolCallId: readId,
      toolName: reader.readTool,
      args: readArgs,
      result,
      ...(isError ? { isError: true } : {}),
    });
    w.startStep();
    w.toolInput(readId, reader.readTool, readArgs);
    let read: FileRead;
    try {
      read = await withRequestContext(this.orm, () => reader.propose(turn.userId, turn.tripId, file));
    } catch (err) {
      logError(`[assistant] reading ${turn.name} failed: ${err instanceof Error ? err.message : String(err)}`);
      await rows.save([readPart(FILE_UNREADABLE, true)], 'error');
      w.toolError(readId, FILE_UNREADABLE);
      w.error('generic');
      w.finish('error');
      return;
    }
    const { found, proposals } = read;
    if (signal.aborted) {
      await rows.save([readPart(found)], 'aborted');
      w.abort();
      return;
    }
    w.toolOutput(readId, found);
    if (proposals.length === 0) {
      await rows.save([readPart(found)], 'error');
      w.finishStep();
      w.error(reader.emptyCode);
      w.finish('error');
      return;
    }
    const card = await readTripCard(this.tools, turn.userId, turn.tripId);
    const ctx = this.cardContext.contextOf(card, new Map(), turn.locale, todayIn(turn.timeZone, new Date()));
    const proposed = proposals.map((proposal) => ({ ...proposal, id: randomUUID() }));
    // The thread shows a call as the reader shows it; the held call keeps everything it runs with.
    const shown = new Map<string, Record<string, unknown>>(proposed.map((c) => [c.id, c.shownArgs ?? c.args]));
    const described = await this.cardContext.describeProposed(turn.userId, turn.tripId, ctx, proposed);
    const held: HeldCall[] = described.map((change) => ({ ...change, providerCallId: `import_${change.id}` }));
    const parts: AssistantMessagePart[] = [
      readPart(found),
      ...held.map((change): AssistantMessagePart => ({
        type: 'tool-call',
        toolCallId: change.id,
        toolName: change.toolName,
        args: shown.get(change.id) ?? change.args,
        approval: { id: change.id },
      })),
      ...held.map((change): AssistantMessagePart => ({ type: 'data-trek-change', data: change.preview })),
    ];
    await rows.hold(parts, held);
    for (const change of held) {
      w.toolInput(change.id, change.toolName, shown.get(change.id) ?? change.args);
      w.approvalRequest(change.id);
      w.change(change.preview);
    }
    w.finishStep();
    w.finish('tool-calls');
  }
}
