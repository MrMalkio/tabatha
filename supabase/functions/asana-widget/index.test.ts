import {
  buildFormMetadata,
  buildWidgetMetadata,
  formatDuration,
  hmacHex,
  parsePostEnvelope,
  validateAsanaRequest,
} from "./index.ts";

function assert(
  value: unknown,
  message = "Expected value to be truthy",
): asserts value {
  if (!value) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${
        JSON.stringify(actual)
      }`,
    );
  }
}

Deno.test("POST envelopes preserve Asana's exact signed data string", () => {
  const data = JSON.stringify({
    task: "123",
    user: "456",
    expires_at: "2099-01-01T00:00:00.000Z",
  });
  const parsed = parsePostEnvelope(JSON.stringify({ data }));
  assertEquals(parsed.signatureMessage, data);
  assertEquals(parsed.payload.task, "123");
});

Deno.test("request validation accepts a fresh exact HMAC and rejects expiry", async () => {
  const query = "task=123&user=456&expires_at=2099-01-01T00%3A00%3A00.000Z";
  const signature = await hmacHex("secret", query);
  const request = new Request(`https://example.test/widget?${query}`, {
    headers: { "x-asana-request-signature": signature },
  });
  const payload = {
    task: "123",
    user: "456",
    expires_at: "2099-01-01T00:00:00.000Z",
  };
  assertEquals(
    await validateAsanaRequest(
      request,
      payload,
      query,
      "secret",
      Date.parse("2026-07-17"),
    ),
    null,
  );
  assert(
    await validateAsanaRequest(
      request,
      payload,
      query,
      "secret",
      Date.parse("2100-01-01"),
    ),
  );
});

Deno.test("widget metadata includes nested and agent attention totals", () => {
  const now = Date.parse("2026-07-17T12:00:00.000Z");
  const widget = buildWidgetMetadata("100", "200", [{
    id: "1",
    task_gid: "100",
    user_gid: "200",
    user_name: "Malkio",
    controller: "human",
    started_at: "2026-07-17T10:00:00.000Z",
    stopped_at: "2026-07-17T11:00:00.000Z",
    duration_s: 3600,
  }, {
    id: "2",
    task_gid: "101",
    ancestor_task_gids: ["100"],
    user_gid: "200",
    user_name: "Agent · Koda",
    controller: "ai-agent",
    agent_name: "Koda",
    started_at: "2026-07-17T11:30:00.000Z",
  }], now);
  const fields = widget.metadata.fields as Array<
    { name: string; text: string }
  >;
  assertEquals(
    fields.find((field) => field.name === "Total attention")?.text,
    "1h 30m",
  );
  assertEquals(
    fields.find((field) => field.name === "Nested rollup")?.text,
    "30m",
  );
  assertEquals(
    fields.find((field) => field.name === "Agent attention")?.text,
    "30m",
  );
});

Deno.test("modal form exposes human and named-agent allocation", () => {
  const form = buildFormMetadata("https://example.test/asana-widget", null);
  assertEquals(form.template, "form_metadata_v0");
  assertEquals(
    form.metadata.on_submit_callback,
    "https://example.test/asana-widget/form/submit",
  );
  assertEquals(formatDuration(3660), "1h 1m");
});
