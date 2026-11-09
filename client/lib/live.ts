/**
 * Live updates while the app is open (Server-Sent Events from /api/live). The connection is only held while the
 * app is visible; in the background web push takes over. Messages are hints to reload the regular endpoints.
 */

export function startLive(handlers: Record<string, () => void>, onReconnect: () => void): void {
  if (!("EventSource" in window)) return;
  let source: EventSource | null = null;
  let wasConnected = false;

  const open = () => {
    if (source) return;
    source = new EventSource("/api/live");
    for (const [topic, fn] of Object.entries(handlers)) source.addEventListener(topic, fn);
    source.addEventListener("open", () => {
      // After a gap (background, network loss) catch up on whatever was missed.
      if (wasConnected) onReconnect();
      wasConnected = true;
    });
  };
  const close = () => {
    source?.close();
    source = null;
  };

  document.addEventListener("visibilitychange", () => (document.visibilityState === "visible" ? open() : close()));
  window.addEventListener("pagehide", close);
  if (document.visibilityState === "visible") open();
}
