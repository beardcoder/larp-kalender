/**
 * Live updates for open app windows via Server-Sent Events: Bun streams them natively, the browser's EventSource
 * reconnects on its own, and they pass through the reverse proxy like any HTTP response. The messages are only
 * hints ("events changed", "new activity"); the app then reloads the regular cached endpoints, so no data is
 * duplicated and nothing is stored per connection. Background delivery stays with web push.
 */

const MAX_CLIENTS = 5_000;
const HEARTBEAT_MS = 25_000; // below Bun's idleTimeout (60 s) and typical proxy timeouts

export type LiveTopic = "events" | "activity";

export class Live {
  private clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
  private encoder = new TextEncoder();
  private heartbeat: Timer | null = null;
  private pending = new Map<LiveTopic, Timer>();

  get size(): number {
    return this.clients.size;
  }

  /** Response for GET /api/live. */
  stream(request: Request): Response {
    if (this.clients.size >= MAX_CLIENTS)
      return new Response("retry: 60000\n\n", { status: 503, headers: { "content-type": "text/event-stream", "retry-after": "60" } });
    let ctrl: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start: (c) => {
        ctrl = c;
        this.clients.add(c);
        // Reconnect after 10 s if the connection drops; the comment flushes headers through proxies.
        c.enqueue(this.encoder.encode("retry: 10000\n: connected\n\n"));
        this.ensureHeartbeat();
      },
      cancel: () => this.drop(ctrl),
    });
    request.signal.addEventListener("abort", () => this.drop(ctrl), { once: true });
    return new Response(body, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      },
    });
  }

  /** Tells all open windows that something changed. Bursts (e.g. an AI research run) are coalesced. */
  notify(topic: LiveTopic, delayMs = 1500): void {
    if (this.pending.has(topic)) return;
    this.pending.set(
      topic,
      setTimeout(() => {
        this.pending.delete(topic);
        this.send(`event: ${topic}\ndata: ${Date.now()}\n\n`);
      }, delayMs),
    );
  }

  private send(message: string): void {
    const chunk = this.encoder.encode(message);
    for (const c of this.clients) {
      try {
        c.enqueue(chunk);
      } catch {
        this.drop(c);
      }
    }
  }

  private drop(c: ReadableStreamDefaultController<Uint8Array> | undefined): void {
    if (!c || !this.clients.delete(c)) return;
    try {
      c.close();
    } catch {
      /* already closed */
    }
    if (!this.clients.size && this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }

  private ensureHeartbeat(): void {
    if (this.heartbeat) return;
    this.heartbeat = setInterval(() => this.send(": ping\n\n"), HEARTBEAT_MS);
  }

  stop(): void {
    for (const c of [...this.clients]) this.drop(c);
    for (const t of this.pending.values()) clearTimeout(t);
    this.pending.clear();
  }
}
