import type { SkiJob, SkiJobResult, SkiRouterRunner } from './ski-router-runner';

import { join } from 'node:path';
import { Worker } from 'node:worker_threads';

/** A job waits this long for its answer, and four seconds more for every leg it plans. */
const BASE_ANSWER_MS = 8000;
const ANSWER_MS_PER_LEG = 4000;
const MAX_ANSWER_MS = 60_000;
/** With this many jobs already waiting, a new one is turned away as busy rather than queued. */
export const MAX_WAITING_JOBS = 8;
/** A thread with nothing to do ends after half an hour; the next job starts one again. */
const IDLE_MS = 30 * 60 * 1000;

interface Waiting {
  settle: (outcome: { result: unknown } | { error: Error }) => void;
  timer: NodeJS.Timeout;
}

type Reply = { id: number; result?: unknown; error?: string };

export function answerTimeoutMs(job: SkiJob): number {
  const legs = job.kind === 'route' ? job.legs.length : 1;
  return Math.min(MAX_ANSWER_MS, BASE_ANSWER_MS + ANSWER_MS_PER_LEG * Math.max(0, legs - 1));
}

/**
 * The piste router's own thread, so a search never holds up the server's
 * requests. Started on the first job and ended when idle; a job not answered
 * in time fails as `timeout` and the thread is replaced, a thread that dies
 * fails what it held, and the next job finds a fresh one.
 */
export class WorkerSkiRouterRunner implements SkiRouterRunner {
  private thread: Worker | null = null;
  private lastId = 0;
  private readonly waiting = new Map<number, Waiting>();
  private idleTimer: NodeJS.Timeout | null = null;

  constructor(private readonly entry = join(__dirname, 'ski-router.worker.js')) {}

  run<J extends SkiJob>(job: J): Promise<SkiJobResult<J>> {
    if (this.waiting.size >= MAX_WAITING_JOBS) return Promise.reject(new Error('busy'));
    const worker = this.ensureThread();
    const id = ++this.lastId;
    return new Promise<SkiJobResult<J>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id);
        reject(new Error('timeout'));
        this.replaceThread();
      }, answerTimeoutMs(job));
      this.waiting.set(id, {
        timer,
        settle: (outcome) => ('error' in outcome ? reject(outcome.error) : resolve(outcome.result as SkiJobResult<J>)),
      });
      worker.postMessage({ id, job });
    });
  }

  forget(file: string): void {
    this.thread?.postMessage({ id: 0, forget: file });
  }

  async close(): Promise<void> {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.failWaiting(new Error('closed'));
    const worker = this.thread;
    this.thread = null;
    await worker?.terminate();
  }

  private ensureThread(): Worker {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => void this.close(), IDLE_MS);
    this.idleTimer.unref();
    if (this.thread) return this.thread;
    // The thread runs the compiled code with the path aliases the server's own start registers.
    const execArgv = process.execArgv.filter(
      (arg, index, all) =>
        arg === '--require' || arg === '-r' || all[index - 1] === '--require' || all[index - 1] === '-r',
    );
    const worker = new Worker(this.entry, { execArgv });
    worker.on('message', (reply: Reply) => this.receive(reply));
    worker.on('error', (err: Error) => this.lost(worker, err));
    worker.on('exit', () => this.lost(worker, new Error('router thread ended')));
    worker.unref();
    this.thread = worker;
    return worker;
  }

  private receive(reply: Reply): void {
    const waiting = this.waiting.get(reply.id);
    if (!waiting) return;
    this.waiting.delete(reply.id);
    clearTimeout(waiting.timer);
    if (reply.result !== undefined) waiting.settle({ result: reply.result });
    else waiting.settle({ error: new Error(reply.error ?? 'router failed') });
  }

  /** A thread that ended or failed takes its jobs with it; one already replaced leaves the new thread's alone. */
  private lost(worker: Worker, err: Error): void {
    if (this.thread !== worker) return;
    this.thread = null;
    this.failWaiting(err);
  }

  private replaceThread(): void {
    const worker = this.thread;
    this.thread = null;
    void worker?.terminate();
  }

  private failWaiting(err: Error): void {
    for (const [id, waiting] of this.waiting) {
      clearTimeout(waiting.timer);
      this.waiting.delete(id);
      waiting.settle({ error: err });
    }
  }
}
