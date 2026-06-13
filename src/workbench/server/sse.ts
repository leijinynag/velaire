import type { RuntimeEvent } from "@/foundation/events/types";

export function encodeRuntimeEvent(event: RuntimeEvent): string {
  return `event: runtime\ndata: ${JSON.stringify(event)}\n\n`;
}

export function runtimeEventsResponse(events: RuntimeEvent[]): Response {
  return new Response(events.map(encodeRuntimeEvent).join(""), {
    headers: {
      "cache-control": "no-cache",
      "content-type": "text/event-stream; charset=utf-8",
    },
  });
}

export function runtimeEventStreamResponse(stream: ReadableStream<string>): Response {
  return new Response(stream.pipeThrough(new TextEncoderStream()), {
    headers: {
      "cache-control": "no-cache",
      "content-type": "text/event-stream; charset=utf-8",
    },
  });
}
