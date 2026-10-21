import type { AiProviderState } from '../../db/json-columns';
import {
  AiProviderError,
  type AiChatClient,
  type AiChatMessage,
  type AiToolCall,
  type AiToolSpec,
} from '../ai-connections/ai-chat-client.interface';
import { activityOf, foundPlacesOf, googleIdsOf, weatherDayOf, weatherOf } from './assistant-cards.helpers';
import type { TripCard } from './assistant-context';
import { outputText } from './assistant-history';
import { toolOutputForProvider } from './assistant-redact';
import { MAX_READS_PER_STEP, MAX_STEPS, MAX_WRITES_PER_STEP } from './assistant-tools.constants';
import type { AssistantToolKind, ToolRun } from './assistant-tools.service';
import type { UiStreamWriter } from './ui-stream.writer';
import type {
  AssistantChangePreview,
  AssistantErrorCode,
  AssistantMessagePart,
  AssistantWeatherDay,
} from '@trek/shared';

type ToolArgs = Record<string, unknown>;

/** The tools of the turn, as the loop uses them (an AssistantToolSession). */
interface AgentToolPort {
  specs(): AiToolSpec[];
  kindOf(name: string): AssistantToolKind | null;
  pinArgs(name: string, args: ToolArgs): { args: ToolArgs } | { error: string };
  call(name: string, args: ToolArgs): Promise<ToolRun>;
}

/** What one step leaves in its message row. */
export interface StepRecord {
  parts: AssistantMessagePart[];
  providerState: AiProviderState | null;
}

/** A change the step proposes, held for the user under its own id. */
export interface HeldCall {
  id: string;
  providerCallId: string;
  toolName: string;
  args: ToolArgs;
  preview: AssistantChangePreview;
}

/** Where the loop keeps its steps: one message row each. */
export interface AgentStore {
  /** The row the next step writes into. */
  openStep(): Promise<number>;
  saveStep(rowId: number, step: StepRecord, status: 'complete' | 'aborted' | 'error'): Promise<void>;
  /** Saves a step that ends waiting for the user, together with the changes it holds. */
  holdStep(rowId: number, step: StepRecord, held: HeldCall[]): Promise<void>;
}

export interface AgentDeps {
  client: AiChatClient;
  tools: AgentToolPort;
  store: AgentStore;
  describe(toolName: string, toolCallId: string, args: ToolArgs): Promise<AssistantChangePreview>;
  newId(): string;
  /** The day's turns on the instance's connection, sent before the turn ends; null when the user pays. */
  quota: { used: number; limit: number } | null;
  /** The trip as the turn read it, for the cards an answer shows beside its text. */
  card: TripCard;
  /** Today in the user's time zone (`YYYY-MM-DD`). */
  today: string;
}

export interface AgentInput {
  system: string;
  context: string;
  cacheKey: string;
  history: AiChatMessage[];
  /** The provider call ids the thread used already; a repeated one is replaced. */
  usedCallIds: Set<string>;
}

interface AgentOutcome {
  end: 'stop' | 'awaiting' | 'max_steps' | 'aborted' | 'failed';
  /** What failed (a provider refusal, the step limit), null for a turn that ended well or was stopped. */
  code: AssistantErrorCode | null;
  inputTokens: number;
  outputTokens: number;
}

const TOO_MANY_CHANGES = `Too many changes in one step: propose at most ${MAX_WRITES_PER_STEP} at once.`;
const TOO_MANY_LOOKUPS = `Too many lookups in one step: make at most ${MAX_READS_PER_STEP} at once.`;

/** What a step collects while its calls run: its parts, and the weather its lookups found. */
interface StepParts {
  parts: AssistantMessagePart[];
  weather: AssistantWeatherDay[];
  /** The google place ids the turn has seen so far; a search adds what it found. */
  knownPlaceIds: Set<string>;
}

const UNKNOWN_PLACE_ID =
  'Unknown place id. Use a google place id from the trip card or from a search result of this turn; ' +
  'if you have none, call search_place first.';

/**
 * Models make up Google place ids (the example from Google's own docs is a
 * favourite), and the lookup then fails in a way that reads like TREK's
 * fault. So a details lookup only runs for an id the turn has seen: one of
 * the trip's places, or one a search of this turn answered with.
 */
function placeIdRefusal(name: string, args: ToolArgs, known: ReadonlySet<string>): string | null {
  if (name !== 'get_place_details') return null;
  return typeof args.placeId === 'string' && known.has(args.placeId) ? null : UNKNOWN_PLACE_ID;
}

/**
 * A first answer that ends on a colon or an ellipsis announced lookups it did
 * not make ("Let me check the weather:"). It gets one push to make them.
 */
const ANNOUNCED = /(?::|…|\.\.\.)$/;
const MAKE_THE_CALLS = 'Go on: make those tool calls now, in this reply, instead of announcing them.';

/**
 * Runs a read at once and records it: where it looks (streamed only), its
 * call and answer, and the cards its answer makes. The cards are built from
 * the tool's own answer, the parts the provider sees from the redacted one.
 */
async function runRead(
  deps: AgentDeps,
  call: { id: string; name: string; args: ToolArgs },
  w: UiStreamWriter,
  step: StepParts,
): Promise<void> {
  const { id, name, args } = call;
  const activity = activityOf(name, id, args, deps.card);
  if (activity) w.activity(activity);
  w.toolInput(id, name, args);
  const run = await deps.tools.call(name, args);
  const output = toolOutputForProvider(name, run.value);
  if (run.ok) w.toolOutput(id, output);
  else w.toolError(id, outputText(output));
  step.parts.push({
    type: 'tool-call',
    toolCallId: id,
    toolName: name,
    args,
    result: output,
    ...(run.ok ? {} : { isError: true }),
  });
  if (!run.ok) return;
  for (const placeId of googleIdsOf(name, run.value)) step.knownPlaceIds.add(placeId);
  const places = foundPlacesOf(name, id, run.value, deps.card, deps.today);
  if (places) {
    w.places(places);
    step.parts.push({ type: 'data-trek-places', data: places });
  }
  const day = weatherDayOf(name, args, run.value, deps.card);
  if (day) step.weather.push(day);
}

function uniqueCallId(call: AiToolCall, used: Set<string>, newId: () => string): string {
  const id = call.id && !used.has(call.id) ? call.id : `call_${newId()}`;
  used.add(id);
  return id;
}

/**
 * One assistant turn: the model is asked, the reads it calls are run and
 * answered, and it is asked again, until it answers without calling a tool,
 * proposes changes, fails, is stopped, or has taken MAX_STEPS steps.
 *
 * Changes are never run here. A step that proposes some is saved with them
 * held, each with its change card, and the turn ends; the user's decision
 * starts the next turn with their results in the history. Each step is saved
 * before its held changes are announced, so a card the client shows always
 * exists on the server.
 */
export async function runAgentLoop(
  deps: AgentDeps,
  input: AgentInput,
  w: UiStreamWriter,
  signal: AbortSignal,
): Promise<AgentOutcome> {
  const usage = { inputTokens: 0, outputTokens: 0 };
  const history = [...input.history];
  const outcome = (end: AgentOutcome['end'], code: AssistantErrorCode | null = null): AgentOutcome => ({
    end,
    code,
    ...usage,
  });
  const finish = (reason: 'stop' | 'tool-calls' | 'error') => {
    if (deps.quota) w.quota(deps.quota.used, deps.quota.limit);
    w.finish(reason);
  };

  const knownPlaceIds = new Set(
    [...deps.card.places.values()].flatMap((place) => (place.googlePlaceId ? [place.googlePlaceId] : [])),
  );
  let nudged = false;

  for (let step = 0; step < MAX_STEPS; step++) {
    const rowId = await deps.store.openStep();
    w.startStep();
    let text = '';
    let providerState: AiProviderState | null = null;
    const received: AiToolCall[] = [];
    try {
      const events = deps.client.stream(
        {
          system: input.system,
          context: input.context,
          messages: history,
          tools: deps.tools.specs(),
          cacheKey: input.cacheKey,
        },
        signal,
      );
      for await (const event of events) {
        if (event.type === 'text-delta') {
          text += event.delta;
          w.text(event.delta);
        } else if (event.type === 'tool-call') received.push(event.call);
        else if (event.type === 'usage') {
          usage.inputTokens += event.inputTokens;
          usage.outputTokens += event.outputTokens;
        } else if (event.type === 'provider-state') providerState = event.state;
      }
    } catch (err) {
      const partial: StepRecord = { parts: text ? [{ type: 'text', text }] : [], providerState: null };
      if (signal.aborted) {
        await deps.store.saveStep(rowId, partial, 'aborted');
        w.abort();
        return outcome('aborted');
      }
      const code = err instanceof AiProviderError ? err.code : 'generic';
      await deps.store.saveStep(rowId, partial, 'error');
      w.error(code);
      finish('error');
      return outcome('failed', code);
    }

    const parts: AssistantMessagePart[] = text ? [{ type: 'text', text }] : [];
    if (received.length === 0 && !nudged && step === 0 && ANNOUNCED.test(text.trimEnd())) {
      nudged = true;
      await deps.store.saveStep(rowId, { parts, providerState }, 'complete');
      w.finishStep();
      history.push({ role: 'assistant', text, toolCalls: [], providerState }, { role: 'user', text: MAKE_THE_CALLS });
      continue;
    }
    if (received.length === 0) {
      await deps.store.saveStep(rowId, { parts, providerState }, 'complete');
      w.finishStep();
      finish('stop');
      return outcome('stop');
    }

    const calls = received.map((call) => ({ ...call, id: uniqueCallId(call, input.usedCallIds, deps.newId) }));
    const writes = calls.filter((call) => deps.tools.kindOf(call.name) === 'write').length;
    const held: HeldCall[] = [];
    const collected: StepParts = { parts, weather: [], knownPlaceIds };
    let reads = 0;
    for (const call of calls) {
      if (signal.aborted) break;
      const kind = deps.tools.kindOf(call.name);
      let prepared = kind ? deps.tools.pinArgs(call.name, call.args) : { error: `Unknown tool: ${call.name}` };
      const unknownPlace = 'error' in prepared ? null : placeIdRefusal(call.name, prepared.args, knownPlaceIds);
      if (unknownPlace) prepared = { error: unknownPlace };
      if (kind === 'read' && !('error' in prepared)) reads += 1;
      const overCap = kind === 'write' ? writes > MAX_WRITES_PER_STEP : reads > MAX_READS_PER_STEP;
      if ('error' in prepared || overCap) {
        let refusal = kind === 'write' ? TOO_MANY_CHANGES : TOO_MANY_LOOKUPS;
        if ('error' in prepared) refusal = prepared.error;
        w.toolInput(call.id, call.name, call.args);
        w.toolError(call.id, refusal);
        parts.push({
          type: 'tool-call',
          toolCallId: call.id,
          toolName: call.name,
          args: call.args,
          result: refusal,
          isError: true,
        });
        continue;
      }
      if (kind === 'read') {
        await runRead(deps, { id: call.id, name: call.name, args: prepared.args }, w, collected);
        continue;
      }
      const id = deps.newId();
      const preview = await deps.describe(call.name, id, prepared.args);
      held.push({ id, providerCallId: call.id, toolName: call.name, args: prepared.args, preview });
    }
    // One weather strip per step, whatever the step held: it is told before the changes.
    const weather = weatherOf(collected.weather);
    if (weather) {
      w.weather(weather);
      parts.push({ type: 'data-trek-weather', data: weather });
    }

    // A stopped step keeps what ran; the changes it was about to propose are dropped, never held.
    if (signal.aborted) {
      await deps.store.saveStep(rowId, { parts, providerState }, 'aborted');
      w.abort();
      return outcome('aborted');
    }
    if (held.length > 0) {
      for (const change of held) {
        const { id, toolName, args } = change;
        parts.push({ type: 'tool-call', toolCallId: id, toolName, args, approval: { id } });
      }
      parts.push(...held.map((change): AssistantMessagePart => ({ type: 'data-trek-change', data: change.preview })));
      await deps.store.holdStep(rowId, { parts, providerState }, held);
      for (const change of held) {
        w.toolInput(change.id, change.toolName, change.args);
        w.approvalRequest(change.id);
        w.change(change.preview);
      }
      w.finishStep();
      finish('tool-calls');
      return outcome('awaiting');
    }

    await deps.store.saveStep(rowId, { parts, providerState }, 'complete');
    w.finishStep();
    history.push({ role: 'assistant', text, toolCalls: calls, providerState });
    for (const part of parts) {
      if (part.type !== 'tool-call') continue;
      history.push({
        role: 'tool',
        toolCallId: part.toolCallId,
        name: part.toolName,
        output: outputText(part.result),
        ...(part.isError ? { isError: true } : {}),
      });
    }
  }

  w.error('max_steps');
  finish('error');
  return outcome('max_steps', 'max_steps');
}
