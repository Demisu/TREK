/**
 * The agent loop over a fake chat client, fake tools and an in-memory store:
 * reads run and are answered, changes are held (saved before they are
 * announced) and end the turn, refusals go back to the model, and the step
 * limit, a provider failure and a stop end the turn the way the client expects.
 */
import type {
  AiChatClient,
  AiChatEvent,
  AiChatRequest,
} from '../../../../src/nest/ai-connections/ai-chat-client.interface';
import { AiProviderError } from '../../../../src/nest/ai-connections/ai-chat-client.interface';
import {
  runAgentLoop,
  type AgentDeps,
  type AgentInput,
  type HeldCall,
  type StepRecord,
} from '../../../../src/nest/assistant/assistant-agent';
import { buildTripCard } from '../../../../src/nest/assistant/assistant-context';
import {
  MAX_READS_PER_STEP,
  MAX_STEPS,
  MAX_WRITES_PER_STEP,
} from '../../../../src/nest/assistant/assistant-tools.constants';
import type { AssistantToolKind } from '../../../../src/nest/assistant/assistant-tools.service';
import { UiStreamWriter } from '../../../../src/nest/assistant/ui-stream.writer';
import type { SseStream } from '../../../../src/nest/common/sse-stream';
import type { AssistantChangePreview, UiStreamChunk } from '@trek/shared';

import { describe, expect, it, vi } from 'vitest';

type Step = AiChatEvent[] | Error;

/** A client that answers each request with the next scripted step, and remembers what it was asked. */
function scriptedClient(steps: Step[]) {
  const requests: AiChatRequest[] = [];
  const client: AiChatClient = {
    kind: 'openai',
    model: 'fake',
    async *stream(request: AiChatRequest) {
      requests.push({ ...request, messages: [...request.messages] });
      const step = steps.shift() ?? [{ type: 'finish', reason: 'stop' }];
      if (step instanceof Error) throw step;
      for (const event of step) yield event;
    },
  };
  return { client, requests };
}

const KINDS: Record<string, AssistantToolKind> = {
  list_places: 'read',
  search_place: 'read',
  get_weather: 'read',
  get_place_details: 'read',
  create_place: 'write',
};

/** What the fake tools answer, per tool; anything else fails. */
const ANSWERS: Record<string, unknown> = {
  list_places: { places: [{ id: 5, name: 'Kinkaku-ji' }] },
  search_place: {
    places: [{ name: 'Ginkaku-ji', lat: 35.027, lng: 135.798, google_place_id: 'ChIJg', website: 'https://g.test' }],
  },
  get_weather: { weather: { temp: 20, main: 'Clouds', description: 'cloudy', type: 'climate' } },
  get_place_details: { details: { name: 'Ginkaku-ji' } },
};

function fakeTools() {
  return {
    specs: () => [{ name: 'list_places', description: 'List', parameters: { type: 'object' } }],
    kindOf: (name: string) => KINDS[name] ?? null,
    pinArgs: vi.fn((name: string, args: Record<string, unknown>) => {
      if (args.tripId !== undefined && args.tripId !== 1) return { error: 'wrong trip' };
      const { tripId: _tripId, ...rest } = args;
      return { args: rest };
    }),
    call: vi.fn(async (name: string) =>
      name in ANSWERS ? { ok: true, value: ANSWERS[name] } : { ok: false, value: 'boom' },
    ),
  };
}

function memoryStore() {
  let next = 100;
  const saved: Array<{ rowId: number; step: StepRecord; status: string }> = [];
  const held: Array<{ rowId: number; step: StepRecord; held: HeldCall[] }> = [];
  return {
    saved,
    held,
    store: {
      openStep: vi.fn(async () => next++),
      saveStep: vi.fn(async (rowId: number, step: StepRecord, status: string) => {
        saved.push({ rowId, step, status });
      }),
      holdStep: vi.fn(async (rowId: number, step: StepRecord, calls: HeldCall[]) => {
        held.push({ rowId, step, held: calls });
      }),
    },
  };
}

function chunkStream() {
  const chunks: UiStreamChunk[] = [];
  const stream: SseStream = {
    send: (data) => {
      if (data !== '[DONE]') chunks.push(JSON.parse(data) as UiStreamChunk);
    },
    comment: () => undefined,
    end: () => undefined,
    open: true,
  };
  return { chunks, writer: new UiStreamWriter(stream) };
}

const preview = (toolCallId: string): AssistantChangePreview => ({
  toolCallId,
  verbKey: 'addPlace',
  subject: 'Kinkaku-ji',
  rows: [],
  dayId: null,
  placeIds: [],
  undoable: true,
});

function setup(steps: Step[], overrides: Partial<AgentDeps> = {}) {
  const { client, requests } = scriptedClient(steps);
  const tools = fakeTools();
  const memory = memoryStore();
  const { chunks, writer } = chunkStream();
  let ids = 0;
  const deps: AgentDeps = {
    client,
    tools,
    store: memory.store,
    describe: vi.fn(async (_name: string, id: string) => preview(id)),
    newId: () => `id-${++ids}`,
    quota: null,
    card: buildTripCard(1, { days: [{ id: 41, day_number: 1, date: '2026-06-11' }] }, null, null),
    today: '2026-01-05',
    ...overrides,
  };
  const input: AgentInput = {
    system: 'sys',
    context: 'ctx',
    cacheKey: 'thread-1',
    history: [{ role: 'user', text: 'Plan Friday' }],
    usedCallIds: new Set(),
  };
  return { deps, input, requests, tools, memory, chunks, writer };
}

const types = (chunks: UiStreamChunk[]) => chunks.map((chunk) => chunk.type);

describe('runAgentLoop', () => {
  it('ASTAGT-001: a text answer is one step, saved complete, finished with stop', async () => {
    const t = setup([
      [
        { type: 'text-delta', delta: 'Hello ' },
        { type: 'text-delta', delta: 'there' },
        { type: 'usage', inputTokens: 10, cachedInputTokens: 0, outputTokens: 3 },
        { type: 'finish', reason: 'stop' },
      ],
    ]);
    const outcome = await runAgentLoop(t.deps, t.input, t.writer, new AbortController().signal);
    expect(outcome).toEqual({ end: 'stop', code: null, inputTokens: 10, cachedInputTokens: 0, outputTokens: 3 });
    expect(t.memory.saved).toEqual([
      { rowId: 100, step: { parts: [{ type: 'text', text: 'Hello there' }], providerState: null }, status: 'complete' },
    ]);
    expect(types(t.chunks)).toEqual([
      'start-step',
      'text-start',
      'text-delta',
      'text-delta',
      'text-end',
      'finish-step',
      'finish',
    ]);
    expect(t.requests[0]).toMatchObject({ system: 'sys', context: 'ctx', cacheKey: 'thread-1' });
  });

  it('ASTAGT-002: a read runs at once, its answer goes back to the model, and the loop goes on', async () => {
    const t = setup([
      [
        { type: 'tool-call', call: { id: 'toolu_1', name: 'list_places', args: { tripId: 1 } } },
        { type: 'provider-state', state: { adapter: 'openai-responses', items: [{ type: 'function_call' }] } },
        { type: 'usage', inputTokens: 5, cachedInputTokens: 0, outputTokens: 1 },
        { type: 'finish', reason: 'tool-calls' },
      ],
      [
        { type: 'text-delta', delta: 'Found it' },
        { type: 'usage', inputTokens: 7, cachedInputTokens: 5, outputTokens: 2 },
      ],
    ]);
    const outcome = await runAgentLoop(t.deps, t.input, t.writer, new AbortController().signal);
    expect(outcome).toEqual({ end: 'stop', code: null, inputTokens: 12, cachedInputTokens: 5, outputTokens: 3 });
    expect(t.tools.call).toHaveBeenCalledWith('list_places', {});
    const second = t.requests[1].messages;
    expect(second[1]).toEqual({
      role: 'assistant',
      text: '',
      toolCalls: [{ id: 'toolu_1', name: 'list_places', args: { tripId: 1 } }],
      providerState: { adapter: 'openai-responses', items: [{ type: 'function_call' }] },
    });
    expect(second[2]).toMatchObject({ role: 'tool', toolCallId: 'toolu_1', name: 'list_places' });
    expect(JSON.parse((second[2] as { output: string }).output)).toEqual({ places: [{ id: 5, name: 'Kinkaku-ji' }] });
    expect(t.memory.saved.map((s) => s.rowId)).toEqual([100, 101]);
    expect(t.memory.saved[0].step.parts).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'toolu_1',
        toolName: 'list_places',
        args: {},
        result: { places: [{ id: 5, name: 'Kinkaku-ji' }] },
      },
    ]);
    expect(types(t.chunks).slice(0, 4)).toEqual([
      'start-step',
      'tool-input-start',
      'tool-input-available',
      'tool-output-available',
    ]);
  });

  it('ASTAGT-003: a change is held: saved with its card before it is announced, and the turn ends', async () => {
    const t = setup([
      [
        { type: 'text-delta', delta: 'Adding it.' },
        { type: 'tool-call', call: { id: 'toolu_9', name: 'create_place', args: { name: 'Kinkaku-ji' } } },
      ],
    ]);
    t.deps.quota = { used: 3, limit: 50 };
    let announcedBeforeSave = false;
    t.memory.store.holdStep.mockImplementation(async (rowId, step, held) => {
      announcedBeforeSave = t.chunks.some((chunk) => chunk.type === 'tool-approval-request');
      t.memory.held.push({ rowId, step, held });
    });
    const outcome = await runAgentLoop(t.deps, t.input, t.writer, new AbortController().signal);
    expect(outcome.end).toBe('awaiting');
    expect(announcedBeforeSave).toBe(false);
    expect(t.tools.call).not.toHaveBeenCalled();
    expect(t.memory.held[0].held).toEqual([
      {
        id: 'id-1',
        providerCallId: 'toolu_9',
        toolName: 'create_place',
        args: { name: 'Kinkaku-ji' },
        preview: preview('id-1'),
      },
    ]);
    expect(t.memory.held[0].step.parts).toEqual([
      { type: 'text', text: 'Adding it.' },
      {
        type: 'tool-call',
        toolCallId: 'id-1',
        toolName: 'create_place',
        args: { name: 'Kinkaku-ji' },
        approval: { id: 'id-1' },
      },
      { type: 'data-trek-change', data: preview('id-1') },
    ]);
    expect(types(t.chunks).slice(-7)).toEqual([
      'tool-input-start',
      'tool-input-available',
      'tool-approval-request',
      'data-trek-change',
      'finish-step',
      'data-trek-quota',
      'finish',
    ]);
    expect(t.chunks.at(-1)).toEqual({ type: 'finish', finishReason: 'tool-calls' });
  });

  it('ASTAGT-004: more changes than a step may hold go back to the model as an error', async () => {
    const calls = Array.from({ length: MAX_WRITES_PER_STEP + 1 }, (_, i): AiChatEvent => ({
      type: 'tool-call',
      call: { id: `w${i}`, name: 'create_place', args: { name: `P${i}` } },
    }));
    const t = setup([calls, [{ type: 'text-delta', delta: 'Fewer then.' }]]);
    const outcome = await runAgentLoop(t.deps, t.input, t.writer, new AbortController().signal);
    expect(outcome.end).toBe('stop');
    expect(t.memory.store.holdStep).not.toHaveBeenCalled();
    const answers = t.requests[1].messages.filter((m) => m.role === 'tool');
    expect(answers).toHaveLength(MAX_WRITES_PER_STEP + 1);
    expect(answers[0]).toMatchObject({ isError: true });
    expect((answers[0] as { output: string }).output).toContain(`at most ${MAX_WRITES_PER_STEP}`);
  });

  it('ASTAGT-012: lookups past the cap of a step are answered as errors, the first ones run', async () => {
    const calls = Array.from({ length: MAX_READS_PER_STEP + 2 }, (_, i): AiChatEvent => ({
      type: 'tool-call',
      call: { id: `r${i}`, name: 'list_places', args: {} },
    }));
    const t = setup([calls, [{ type: 'text-delta', delta: 'Enough.' }]]);
    const outcome = await runAgentLoop(t.deps, t.input, t.writer, new AbortController().signal);
    expect(outcome.end).toBe('stop');
    expect(t.tools.call).toHaveBeenCalledTimes(MAX_READS_PER_STEP);
    const answers = t.requests[1].messages.filter((m) => m.role === 'tool');
    expect(answers).toHaveLength(MAX_READS_PER_STEP + 2);
    expect(answers[MAX_READS_PER_STEP - 1]).not.toHaveProperty('isError');
    expect(answers[MAX_READS_PER_STEP]).toMatchObject({ isError: true });
    expect((answers.at(-1) as { output: string }).output).toContain(`at most ${MAX_READS_PER_STEP}`);
  });

  it('ASTAGT-005: an unknown tool, a foreign trip and a failing read are answered as errors', async () => {
    const t = setup([
      [
        { type: 'tool-call', call: { id: 'a', name: 'delete_trip', args: {} } },
        { type: 'tool-call', call: { id: 'b', name: 'list_places', args: { tripId: 2 } } },
        { type: 'tool-call', call: { id: 'c', name: 'list_places', args: {} } },
      ],
      [{ type: 'text-delta', delta: 'ok' }],
    ]);
    t.tools.call.mockResolvedValueOnce({ ok: false, value: 'Trip not found or access denied.' });
    await runAgentLoop(t.deps, t.input, t.writer, new AbortController().signal);
    const answers = t.requests[1].messages.filter((m) => m.role === 'tool') as Array<{
      output: string;
      isError?: boolean;
    }>;
    expect(answers.map((a) => [a.output, a.isError])).toEqual([
      ['Unknown tool: delete_trip', true],
      ['wrong trip', true],
      ['Trip not found or access denied.', true],
    ]);
    expect(t.tools.call).toHaveBeenCalledTimes(1);
    expect(t.chunks.filter((chunk) => chunk.type === 'tool-output-error')).toHaveLength(3);
  });

  it('ASTAGT-006: a call id the thread used already is replaced', async () => {
    const t = setup([[{ type: 'tool-call', call: { id: 'call_0', name: 'list_places', args: {} } }], []]);
    t.input.usedCallIds.add('call_0');
    await runAgentLoop(t.deps, t.input, t.writer, new AbortController().signal);
    const assistant = t.requests[1].messages[1] as { toolCalls: Array<{ id: string }> };
    expect(assistant.toolCalls[0].id).toBe('call_id-1');
  });

  it('ASTAGT-007: stops after MAX_STEPS steps with max_steps', async () => {
    const reads = Array.from({ length: MAX_STEPS }, (_, i): Step => [
      { type: 'tool-call', call: { id: `r${i}`, name: 'list_places', args: {} } },
    ]);
    const t = setup(reads);
    const outcome = await runAgentLoop(t.deps, t.input, t.writer, new AbortController().signal);
    expect(outcome).toMatchObject({ end: 'max_steps', code: 'max_steps' });
    expect(t.requests).toHaveLength(MAX_STEPS);
    expect(t.chunks.slice(-2)).toEqual([
      { type: 'error', errorText: 'max_steps' },
      { type: 'finish', finishReason: 'error' },
    ]);
  });

  it('ASTAGT-008: a provider failure saves what came and ends with its code', async () => {
    const t = setup([new AiProviderError('rate_limited', 429, true)]);
    const outcome = await runAgentLoop(t.deps, t.input, t.writer, new AbortController().signal);
    expect(outcome).toMatchObject({ end: 'failed', code: 'rate_limited' });
    expect(t.memory.saved).toEqual([{ rowId: 100, step: { parts: [], providerState: null }, status: 'error' }]);
    expect(t.chunks.slice(-2)).toEqual([
      { type: 'error', errorText: 'rate_limited' },
      { type: 'finish', finishReason: 'error' },
    ]);
  });

  it('ASTAGT-009: an unexpected failure reads as generic', async () => {
    const t = setup([new Error('socket hang up')]);
    expect((await runAgentLoop(t.deps, t.input, t.writer, new AbortController().signal)).code).toBe('generic');
  });

  it('ASTAGT-010: a stop saves the step as aborted, holds nothing and ends with abort', async () => {
    const controller = new AbortController();
    const t = setup([
      [
        { type: 'text-delta', delta: 'Let me' },
        { type: 'tool-call', call: { id: 'w', name: 'create_place', args: { name: 'X' } } },
      ],
    ]);
    t.deps.describe = vi.fn(async (_name: string, id: string) => {
      controller.abort();
      return preview(id);
    });
    const outcome = await runAgentLoop(t.deps, t.input, t.writer, controller.signal);
    expect(outcome.end).toBe('aborted');
    expect(t.memory.store.holdStep).not.toHaveBeenCalled();
    expect(t.memory.saved[0]).toMatchObject({ status: 'aborted' });
    expect(t.chunks.at(-1)).toEqual({ type: 'abort' });
  });

  it('ASTAGT-013: a search streams where it looks, then its answer, then its cards; the weather comes once a step', async () => {
    const t = setup([
      [
        {
          type: 'tool-call',
          call: { id: 'find', name: 'search_place', args: { query: 'temples', locationBias: { lat: 35, lng: 135.7 } } },
        },
        {
          type: 'tool-call',
          call: { id: 'sky1', name: 'get_weather', args: { lat: 35, lng: 135.7, date: '2026-06-11' } },
        },
        {
          type: 'tool-call',
          call: { id: 'sky2', name: 'get_weather', args: { lat: 35, lng: 135.7, date: '2026-06-12' } },
        },
      ],
      [{ type: 'text-delta', delta: 'Here.' }],
    ]);
    await runAgentLoop(t.deps, t.input, t.writer, new AbortController().signal);
    expect(types(t.chunks).slice(0, 13)).toEqual([
      'start-step',
      'data-trek-activity',
      'tool-input-start',
      'tool-input-available',
      'tool-output-available',
      'data-trek-places',
      'data-trek-activity',
      'tool-input-start',
      'tool-input-available',
      'tool-output-available',
      'data-trek-activity',
      'tool-input-start',
      'tool-input-available',
    ]);
    expect(types(t.chunks).filter((type) => type === 'data-trek-weather')).toHaveLength(1);
    const step = t.memory.saved[0].step.parts;
    expect(step.map((part) => part.type)).toEqual([
      'tool-call',
      'data-trek-places',
      'tool-call',
      'tool-call',
      'data-trek-weather',
    ]);
    const places = step.find((part) => part.type === 'data-trek-places');
    expect(places?.type === 'data-trek-places' && places.data.places[0]).toMatchObject({
      ref: 'find:0',
      photoKey: 'ChIJg',
    });
    expect(JSON.stringify(places)).not.toContain('g.test');
    const weather = step.find((part) => part.type === 'data-trek-weather');
    expect(weather?.type === 'data-trek-weather' && weather.data.days).toEqual([
      { dayId: 41, date: '2026-06-11', main: 'Clouds', tempMax: 20, tempMin: null, rainPct: null, kind: 'climate' },
      { dayId: null, date: '2026-06-12', main: 'Clouds', tempMax: 20, tempMin: null, rainPct: null, kind: 'climate' },
    ]);
    const answers = t.requests[1].messages.filter((m) => m.role === 'tool');
    expect(answers).toHaveLength(3);
  });

  it('ASTAGT-014: the weather of a step that proposes changes is kept before the cards, and a failed search makes none', async () => {
    const t = setup([
      [
        {
          type: 'tool-call',
          call: { id: 'sky', name: 'get_weather', args: { lat: 35, lng: 135.7, date: '2026-06-11' } },
        },
        { type: 'tool-call', call: { id: 'gone', name: 'search_place', args: { query: 'x' } } },
        { type: 'tool-call', call: { id: 'w', name: 'create_place', args: { name: 'X' } } },
      ],
    ]);
    t.tools.call.mockImplementation(async (name: string) =>
      name === 'get_weather' ? { ok: true, value: ANSWERS.get_weather } : { ok: false, value: 'Place search failed.' },
    );
    await runAgentLoop(t.deps, t.input, t.writer, new AbortController().signal);
    expect(t.memory.held[0].step.parts.map((part) => part.type)).toEqual([
      'tool-call',
      'tool-call',
      'data-trek-weather',
      'tool-call',
      'data-trek-change',
    ]);
    expect(types(t.chunks)).not.toContain('data-trek-places');
  });

  it('ASTAGT-011: a stop while the provider streams saves the text so far', async () => {
    const controller = new AbortController();
    const client: AiChatClient = {
      kind: 'openai',
      model: 'fake',
      async *stream() {
        yield { type: 'text-delta', delta: 'Half' } as AiChatEvent;
        controller.abort();
        throw new Error('aborted');
      },
    };
    const t = setup([], { client });
    const outcome = await runAgentLoop(t.deps, t.input, t.writer, controller.signal);
    expect(outcome.end).toBe('aborted');
    expect(t.memory.saved).toEqual([
      { rowId: 100, step: { parts: [{ type: 'text', text: 'Half' }], providerState: null }, status: 'aborted' },
    ]);
  });

  it('ASTAGT-015: a details lookup runs only for a google id from the card or a search of this turn', async () => {
    const places = { places: [{ id: 9, name: 'Nishiki', google_place_id: 'ChIJn' }] };
    const card = buildTripCard(1, { days: [] }, places, null);
    const details = (id: string, placeId: string) => ({
      type: 'tool-call' as const,
      call: { id, name: 'get_place_details', args: { placeId } },
    });
    const t = setup(
      [
        [details('c1', 'ChIJN1t_tDeuEmsRUsoyG83frY4'), details('c2', 'ChIJn')],
        [{ type: 'tool-call', call: { id: 'c3', name: 'search_place', args: { query: 'Ginkaku' } } }],
        [details('c4', 'ChIJg')],
        [{ type: 'text-delta', delta: 'Open until five' }],
      ],
      { card },
    );
    await runAgentLoop(t.deps, t.input, t.writer, new AbortController().signal);
    expect(t.tools.call).toHaveBeenCalledTimes(3);
    expect(t.tools.call).toHaveBeenNthCalledWith(1, 'get_place_details', { placeId: 'ChIJn' });
    expect(t.tools.call).toHaveBeenNthCalledWith(3, 'get_place_details', { placeId: 'ChIJg' });
    const refused = t.requests[1].messages.find((m) => m.role === 'tool' && m.toolCallId === 'c1');
    expect(refused).toMatchObject({ isError: true, output: expect.stringContaining('call search_place first') });
  });

  it('ASTAGT-016: a first answer that only announces its lookups is pushed once to make them', async () => {
    const t = setup([
      [{ type: 'text-delta', delta: 'Let me look up the weather first:' }],
      [{ type: 'tool-call', call: { id: 'w1', name: 'get_weather', args: { lat: 1, lng: 2, date: '2026-06-11' } } }],
      [{ type: 'text-delta', delta: 'Rain, so here is an indoor plan...' }],
    ]);
    const outcome = await runAgentLoop(t.deps, t.input, t.writer, new AbortController().signal);
    expect(outcome.end).toBe('stop');
    expect(t.tools.call).toHaveBeenCalledWith('get_weather', expect.anything());
    expect(t.requests[1].messages.slice(-1)[0]).toMatchObject({ role: 'user', text: expect.stringContaining('now') });
    // Only once: the third answer ends on an ellipsis too and still ends the turn.
    expect(t.requests).toHaveLength(3);
  });

  it('ASTAGT-017: an empty answer gets one push without an empty message in the history; a second one is an error', async () => {
    const recovered = setup([
      [{ type: 'tool-call', call: { id: 's1', name: 'search_place', args: { query: 'Sushi' } } }],
      [{ type: 'finish', reason: 'stop' }],
      [{ type: 'text-delta', delta: 'Here are three for tonight.' }],
    ]);
    expect(
      (await runAgentLoop(recovered.deps, recovered.input, recovered.writer, new AbortController().signal)).end,
    ).toBe('stop');
    const pushed = recovered.requests[2].messages;
    expect(pushed.at(-1)).toMatchObject({ role: 'user', text: expect.stringContaining('came back empty') });
    expect(pushed.at(-2)).toMatchObject({ role: 'tool', toolCallId: 's1' });

    const stuck = setup([[{ type: 'finish', reason: 'stop' }], [{ type: 'finish', reason: 'stop' }]]);
    const outcome = await runAgentLoop(stuck.deps, stuck.input, stuck.writer, new AbortController().signal);
    expect(outcome).toMatchObject({ end: 'failed', code: 'empty_answer' });
    expect(stuck.chunks).toContainEqual({ type: 'error', errorText: 'empty_answer' });
  });

  it('ASTAGT-018: an answer cut off by the length limit is pushed to go on', async () => {
    const t = setup([
      [
        { type: 'text-delta', delta: 'Day 1: Senso-ji, then' },
        { type: 'finish', reason: 'length' },
      ],
      [{ type: 'text-delta', delta: ' Skytree in the evening.' }],
    ]);
    expect((await runAgentLoop(t.deps, t.input, t.writer, new AbortController().signal)).end).toBe('stop');
    expect(t.requests[1].messages.slice(-2)).toMatchObject([
      { role: 'assistant', text: 'Day 1: Senso-ji, then' },
      { role: 'user', text: expect.stringContaining('cut off') },
    ]);
  });
});
