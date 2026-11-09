import { expect, test } from "bun:test";
import { Live } from "../src/live.ts";

test("live stream delivers coalesced hints and forgets closed connections", async () => {
  const live = new Live();
  const abort = new AbortController();
  const res = live.stream(new Request("http://x/api/live", { signal: abort.signal }));
  expect(res.headers.get("content-type")).toStartWith("text/event-stream");
  expect(live.size).toBe(1);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  expect(decoder.decode((await reader.read()).value)).toContain("retry: 10000");

  live.notify("events", 0);
  live.notify("events", 0); // coalesced with the first one
  const chunk = decoder.decode((await reader.read()).value);
  expect(chunk).toStartWith("event: events\n");

  abort.abort();
  expect(live.size).toBe(0);
  live.stop();
});
