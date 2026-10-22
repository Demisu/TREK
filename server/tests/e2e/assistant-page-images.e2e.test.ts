/**
 * The Studio page image reaching the model, per provider kind, end to end:
 * the whole app (buildApp, every global guard, the Zod pipe, the real MCP
 * registry, the real agent and vision) with the provider's own adapter
 * (Anthropic Messages, Chat Completions, the Responses API of a ChatGPT plan)
 * talking to a scripted fetch instead of the network.
 *
 * What is stood in for, and why: the connection the turn resolves names the
 * kind under test (an instance can only point a `custom` connection at
 * loopback), the user's Studio acknowledgement is given, and the Studio tab's
 * upload is the render registry answering at once with a page image (the
 * upload route itself is ASTRNE2E's). Everything between, from the look to
 * the request on the wire, is the real code.
 *
 * Pinned: a model that reads images gets the page in the place its provider
 * reads it (inside the tool_result for Anthropic, a user message after the
 * step's tool answers for Chat Completions and the Responses API), the turn
 * streams one render request and keeps the image's size, never its bytes; a
 * kind that cannot be told to read images (OpenRouter) asks for no image and
 * checks the page on its description.
 */
import { buildApp } from '../../src/bootstrap';
import { AiChatClientService } from '../../src/nest/ai-connections/ai-chat-client.service';
import { AiConnectionsService } from '../../src/nest/ai-connections/ai-connections.service';
import type { ResolvedAiConnection } from '../../src/nest/ai-connections/ai-connections.types';
import { AnthropicMessagesClient } from '../../src/nest/ai-connections/providers/anthropic-messages.client';
import { OpenAiChatClient } from '../../src/nest/ai-connections/providers/openai-chat.client';
import { OpenAiResponsesClient } from '../../src/nest/ai-connections/providers/openai-responses.client';
import type { AiFetch } from '../../src/nest/ai-connections/providers/provider-http';
import { AssistantRenderRegistry, type PageImage } from '../../src/nest/assistant/assistant-render.registry';
import { JourneyBookEditService } from '../../src/nest/journey/journey-book-edit.service';
import { makeJourney } from '../helpers/factories/journeys';
import { setAddonEnabled } from '../helpers/factories/settings';
import { makeUser } from '../helpers/factories/users';
import { resetRateLimits } from '../helpers/test-db';
import { sessionCookie } from './harness';
import { MikroORM } from '@mikro-orm/core';
import type { INestApplication } from '@nestjs/common';
import type { AiConnectionKind, UiStreamChunk } from '@trek/shared';

import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ── The page the Studio "uploads" ────────────────────────────────────────────

const JPEG = Buffer.from('ffd8ffe000104a46494600010100ffd9', 'hex');
const PAGE: PageImage = { mimeType: 'image/jpeg', data: JPEG, width: 1280, height: 640 };
const DATA_URL = `data:image/jpeg;base64,${JPEG.toString('base64')}`;

// ── The provider, per kind: what each adapter streams back ───────────────────

/** An SSE answer from whole events, as the adapters read it. */
function sse(events: unknown[]): Response {
  const text = events.map((e) => `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`).join('');
  return new Response(text, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

type Wire = 'anthropic' | 'chat' | 'responses';

const PREVIEW = 'preview_book_page';

/** The model looks at a page with one call, as each provider streams a tool call. */
function lookAt(wire: Wire, args: Record<string, unknown>): Response {
  const json = JSON.stringify(args);
  if (wire === 'anthropic') {
    return sse([
      { type: 'message_start', message: { usage: { input_tokens: 10, output_tokens: 1 } } },
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 'call_look', name: PREVIEW },
      },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: json } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 20 } },
      { type: 'message_stop' },
    ]);
  }
  if (wire === 'chat') {
    const call = { index: 0, id: 'call_look', type: 'function', function: { name: PREVIEW, arguments: json } };
    return sse([
      { choices: [{ index: 0, delta: { tool_calls: [call] } }] },
      { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
      { choices: [], usage: { prompt_tokens: 12, completion_tokens: 4 } },
      '[DONE]',
    ]);
  }
  const item = { type: 'function_call', id: 'fc_1', call_id: 'call_look', name: PREVIEW, arguments: json };
  return sse([
    { type: 'response.created', response: {} },
    { type: 'response.output_item.done', item: { ...item, namespace: 'trek' } },
    { type: 'response.completed', response: { usage: { input_tokens: 50, output_tokens: 6 } } },
  ]);
}

/** The model's last words, as each provider streams text. */
function says(wire: Wire, text: string): Response {
  if (wire === 'anthropic') {
    return sse([
      { type: 'message_start', message: { usage: { input_tokens: 10, output_tokens: 1 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 4 } },
      { type: 'message_stop' },
    ]);
  }
  if (wire === 'chat') {
    return sse([
      { choices: [{ index: 0, delta: { content: text } }] },
      { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
      { choices: [], usage: { prompt_tokens: 12, completion_tokens: 4 } },
      '[DONE]',
    ]);
  }
  return sse([
    { type: 'response.created', response: {} },
    { type: 'response.output_text.delta', delta: text },
    { type: 'response.completed', response: { usage: { input_tokens: 50, output_tokens: 6 } } },
  ]);
}

/** What the adapters sent, request by request, and what they are answered next. */
const wire = { bodies: [] as Array<Record<string, unknown>>, answers: [] as Response[] };

const scripted: AiFetch = async (_url, init) => {
  wire.bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
  const next = wire.answers.shift();
  if (!next) throw new Error('the scripted provider has no answer left');
  return next;
};

/** The real adapter of a kind, on the scripted fetch. */
function adapterFor(kind: AiConnectionKind, model: string) {
  if (kind === 'anthropic') return new AnthropicMessagesClient(model, 'sk-ant-test', scripted);
  if (kind === 'chatgpt') return new OpenAiResponsesClient(model, async () => 'at-test', scripted);
  return new OpenAiChatClient(kind, model, 'https://provider.invalid/v1', 'sk-test', scripted);
}

// ── A loopback server, only so the instance connection can be saved ─────────

async function answerModels(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'GET' && req.url?.startsWith('/api/tags')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ models: [{ name: 'fake-model', size: 1 }] }));
    return;
  }
  res.writeHead(404).end();
}

// ── The app ──────────────────────────────────────────────────────────────────

let nestApp: INestApplication;
let orm: MikroORM;
let fake: HttpServer;
let books: JourneyBookEditService;
let connections: AiConnectionsService;
let chatClients: AiChatClientService;
let registry: AssistantRenderRegistry;

beforeAll(async () => {
  fake = createServer((req, res) => {
    answerModels(req, res).catch(() => res.destroy());
  });
  await new Promise<void>((resolve) => fake.listen(0, '127.0.0.1', resolve));
  nestApp = await buildApp();
  orm = nestApp.get(MikroORM);
  books = nestApp.get(JourneyBookEditService);
  connections = nestApp.get(AiConnectionsService);
  chatClients = nestApp.get(AiChatClientService);
  registry = nestApp.get(AssistantRenderRegistry);
  await setAddonEnabled(orm, 'ai_assistant', true);
  await setAddonEnabled(orm, 'journey', true);
  const adminId = (await makeUser(orm, { role: 'admin' })).user.id;
  const { port } = fake.address() as AddressInfo;
  const res = await request(nestApp.getHttpServer())
    .put('/api/admin/ai/connection')
    .set('Cookie', sessionCookie(adminId))
    .send({ kind: 'custom', baseUrl: `http://127.0.0.1:${port}/v1`, model: 'fake-model' });
  expect(res.status).toBe(200);
});

beforeEach(async () => {
  await resetRateLimits(nestApp);
  vi.restoreAllMocks();
  wire.bodies = [];
  wire.answers = [];
});

afterAll(async () => {
  vi.restoreAllMocks();
  await nestApp.close();
  await new Promise<void>((resolve) => fake.close(() => resolve()));
});

/** The turn runs on `kind`'s adapter as if that connection were saved, the Studio images acknowledged. */
function runOn(kind: AiConnectionKind, model: string) {
  const resolve = connections.resolveForUser.bind(connections);
  vi.spyOn(connections, 'resolveForUser').mockImplementation(async (userId: number): Promise<ResolvedAiConnection> => ({
    ...(await resolve(userId)),
    kind,
    model,
  }));
  vi.spyOn(connections, 'studioImagesAcked').mockResolvedValue(true);
  vi.spyOn(chatClients, 'create').mockImplementation(() => adapterFor(kind, model));
  return vi.spyOn(registry, 'wait').mockResolvedValue(PAGE);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const CTX = { locale: 'en', timeZone: 'Europe/Lisbon' };

async function stream(path: string, userId: number, body: object): Promise<UiStreamChunk[]> {
  const res = await request(nestApp.getHttpServer())
    .post(path)
    .set('Cookie', sessionCookie(userId))
    .send(body)
    .buffer(true)
    .parse((s, done) => {
      let text = '';
      s.setEncoding('utf8');
      s.on('data', (chunk: string) => (text += chunk));
      s.on('end', () => done(null, text));
    });
  expect(res.status).toBe(200);
  return (res.body as string)
    .split('\n\n')
    .filter((event) => event.startsWith('data: ') && event !== 'data: [DONE]')
    .map((event) => JSON.parse(event.slice('data: '.length)) as UiStreamChunk);
}

const ofType = <T extends UiStreamChunk['type']>(chunks: UiStreamChunk[], type: T) =>
  chunks.filter((chunk): chunk is Extract<UiStreamChunk, { type: T }> => chunk.type === type);

/** A user with a journey of their own and a blank book in it: its double page is `inner`. */
async function ownerWithBook() {
  const { user } = await makeUser(orm);
  const journey = await makeJourney(orm, user.id, { title: 'Portugal by train' });
  const created = await books.createBook(journey.id, user.id, {});
  const inner = created.pages.find((page) => page.role === 'inner')?.id ?? 'no inner page';
  return { userId: user.id, journeyId: journey.id, inner, base: `/api/journeys/${journey.id}/assistant` };
}

/** One Studio turn on `kind`: the model previews warmer paper on the inner page, then answers. */
async function lookTurn(kind: AiConnectionKind, model: string, via: Wire) {
  const j = await ownerWithBook();
  const waited = runOn(kind, model);
  const warmer = { spreadId: j.inner, ops: [{ op: 'background', color: '#f4efe6' }] };
  wire.answers = [lookAt(via, warmer), says(via, 'Fine.')];
  const turn = await stream(`${j.base}/chat`, j.userId, { ...CTX, threadId: null, text: 'Warmer?', renders: true });
  expect(wire.bodies).toHaveLength(2);
  return { j, turn, waited, sent: wire.bodies[1] ?? {} };
}

/** A list in a request body, empty when that key holds none. */
const listIn = (body: Record<string, unknown>, key: string): Array<Record<string, unknown>> => {
  const value = body[key];
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
};

/** The turn asked the Studio once for the page and kept the image's size, never its bytes. */
function expectOneImage(turn: UiStreamChunk[], spreadId: string) {
  const [asked, ...more] = ofType(turn, 'data-trek-render-request');
  expect(more).toEqual([]);
  expect(asked?.data).toMatchObject({ spreadId, bookVersion: 1, hiddenPhotoIds: [] });
  const [view] = ofType(turn, 'data-trek-page-view');
  expect(view?.data).toMatchObject({ spreadId, bookVersion: 1, width: 1280, height: 640, bytes: JPEG.length });
  expect(JSON.stringify(ofType(turn, 'tool-output-available'))).toContain('is attached');
  expect(JSON.stringify(turn)).not.toContain(JPEG.toString('base64'));
}

// ── Cases ────────────────────────────────────────────────────────────────────

describe('the Studio page image per provider kind', () => {
  it('ASTIMGE2E-001: Anthropic gets the page as an image block inside the tool_result of the look', async () => {
    const { j, turn, waited, sent } = await lookTurn('anthropic', 'claude-sonnet-4-5', 'anthropic');
    expect(waited).toHaveBeenCalledTimes(1);
    expectOneImage(turn, j.inner);
    const results = listIn(sent, 'messages').flatMap((message) =>
      Array.isArray(message.content) ? (message.content as Array<Record<string, unknown>>) : [],
    );
    const result = results.find((block) => block.type === 'tool_result' && block.tool_use_id === 'call_look');
    expect(result?.content).toEqual([
      { type: 'text', text: expect.stringContaining('is attached') },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: JPEG.toString('base64') } },
    ]);
  });

  /** Chat Completions: the tool answer stays text, the page follows in a user message of its own. */
  async function expectChatImage(kind: AiConnectionKind, model: string) {
    const { j, turn, sent } = await lookTurn(kind, model, 'chat');
    expectOneImage(turn, j.inner);
    const messages = listIn(sent, 'messages');
    const answer = messages.findIndex((m) => m.role === 'tool' && m.tool_call_id === 'call_look');
    expect(answer).toBeGreaterThan(0);
    expect(typeof messages[answer]?.content).toBe('string');
    expect(messages[answer + 1]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'The image the call preview_book_page (call_look) produced:' },
        { type: 'image_url', image_url: { url: DATA_URL, detail: 'high' } },
      ],
    });
  }

  it('ASTIMGE2E-002: OpenAI keeps the tool answer text and sends the page in a user message after it', async () => {
    await expectChatImage('openai', 'gpt-4o');
  });

  it('ASTIMGE2E-005: Gemini, on the same Chat Completions shape, gets the page the same way', async () => {
    await expectChatImage('gemini', 'gemini-2.5-flash');
  });

  it('ASTIMGE2E-003: a ChatGPT plan (Responses API) gets the output as text, then the page as an image', async () => {
    const { j, turn, sent } = await lookTurn('chatgpt', 'gpt-5', 'responses');
    expectOneImage(turn, j.inner);
    const input = listIn(sent, 'input');
    const output = input.findIndex((item) => item.type === 'function_call_output' && item.call_id === 'call_look');
    expect(output).toBeGreaterThan(0);
    expect(typeof input[output]?.output).toBe('string');
    expect(input[output + 1]).toEqual({
      type: 'message',
      role: 'user',
      content: [
        { type: 'input_text', text: 'The image the call preview_book_page (call_look) produced:' },
        { type: 'input_image', image_url: DATA_URL, detail: 'high' },
      ],
    });
  });

  it('ASTIMGE2E-004: OpenRouter (vision unknown by id) asks for no image and reads the page in words', async () => {
    const { j, turn, waited, sent } = await lookTurn('openrouter', 'some-lab/some-model', 'chat');
    expect(waited).not.toHaveBeenCalled();
    expect(ofType(turn, 'data-trek-render-request')).toEqual([]);
    const [view] = ofType(turn, 'data-trek-page-view');
    expect(view?.data).toMatchObject({ spreadId: j.inner, width: null, height: null, bytes: null });
    expect(JSON.stringify(sent)).not.toContain('image_url');
    const answer = listIn(sent, 'messages').find((m) => m.role === 'tool' && m.tool_call_id === 'call_look');
    expect(String(answer?.content)).toContain('Findings');
  });
});
