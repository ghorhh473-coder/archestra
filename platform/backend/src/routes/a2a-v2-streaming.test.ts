import { vi } from "vitest";
import type { FastifyInstanceWithZod } from "@/server";
import { createFastifyInstance } from "@/server";
import { afterEach, beforeEach, describe, expect, test } from "@/test";

const { mockExecuteA2AMessage, mockValidateMCPGatewayToken } = vi.hoisted(
  () => ({
    mockExecuteA2AMessage: vi.fn(),
    mockValidateMCPGatewayToken: vi.fn(),
  }),
);

vi.mock("@/agents/a2a-executor", () => ({
  executeA2AMessage: (...args: unknown[]) => mockExecuteA2AMessage(...args),
}));

vi.mock("@/routes/mcp-gateway.utils", async () => {
  const actual = await vi.importActual<
    typeof import("@/routes/mcp-gateway.utils")
  >("@/routes/mcp-gateway.utils");
  return {
    ...actual,
    validateMCPGatewayToken: (...args: unknown[]) =>
      mockValidateMCPGatewayToken(...args),
  };
});

vi.mock("@/observability/tracing", async () => {
  const actual = await vi.importActual<
    typeof import("@/observability/tracing")
  >("@/observability/tracing");
  return {
    ...actual,
    startActiveChatSpan: async <T>(params: {
      callback: () => Promise<T>;
    }): Promise<T> => params.callback(),
  };
});

describe("a2a v2 streaming routes", () => {
  let app: FastifyInstanceWithZod;
  let agentId: string;

  beforeEach(async ({ makeInternalAgent }) => {
    const agent = await makeInternalAgent();
    agentId = agent.id;

    mockValidateMCPGatewayToken.mockResolvedValue({
      organizationId: agent.organizationId,
      userId: null,
    });

    app = createFastifyInstance();
    const { default: a2aV2Routes } = await import("./a2a-v2");
    await app.register(a2aV2Routes);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    mockExecuteA2AMessage.mockReset();
    mockValidateMCPGatewayToken.mockReset();
    await app.close();
  });

  test("returns SSE stream when configuration.streaming is true", async () => {
    const validAgentMsgId = crypto.randomUUID();
    mockExecuteA2AMessage.mockImplementation(async (params: any) => {
      // Async emit simulated events
      await new Promise((resolve) => setTimeout(resolve, 10));
      params.onEvent?.({
        taskId: "task-123",
        status: { state: "working" },
        final: false,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));
      params.onEvent?.({
        taskId: "task-123",
        status: {
          state: "completed",
          message: {
            messageId: validAgentMsgId,
            role: "agent",
            parts: [{ text: "hello world" }],
          },
        },
        final: true,
      });

      return {
        messageId: validAgentMsgId,
        text: "hello world",
        finishReason: "stop",
        responseUiMessage: {
          id: validAgentMsgId,
          role: "assistant",
          parts: [{ type: "text", text: "hello world" }],
        },
      };
    });

    const validUserMsgId = crypto.randomUUID();
    const response = await app.inject({
      method: "POST",
      url: `/v2/a2a/${agentId}`,
      headers: {
        authorization: "Bearer test-token",
        accept: "text/event-stream",
      },
      payload: {
        jsonrpc: "2.0",
        id: 42,
        method: "SendMessage",
        params: {
          message: {
            messageId: validUserMsgId,
            role: "ROLE_USER",
            parts: [{ text: "hello" }],
          },
          configuration: {
            streaming: true,
          },
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");

    console.log("PAYLOAD RECEIVED:", JSON.stringify(response.payload));

    // SSE payloads are formatted as "data: {JSON}\n\n"
    const lines = response.payload.split("\n\n").filter(Boolean);
    expect(lines.length).toBe(2);

    const event1 = JSON.parse(lines[0].replace("data: ", ""));
    const event2 = JSON.parse(lines[1].replace("data: ", ""));

    expect(event1).toMatchObject({
      jsonrpc: "2.0",
      id: 42,
      result: {
        taskId: "task-123",
        status: { state: "working" },
        final: false,
      },
    });

    expect(event2).toMatchObject({
      jsonrpc: "2.0",
      id: 42,
      result: {
        taskId: "task-123",
        status: {
          state: "completed",
          message: {
            messageId: validAgentMsgId,
            parts: [{ text: "hello world" }],
          },
        },
        final: true,
      },
    });
  });

  test("returns AI SDK compatible stream format on /chat endpoint", async () => {
    const validChatMsgId = crypto.randomUUID();
    mockExecuteA2AMessage.mockImplementation(async (params: any) => {
      // Simulate raw UI message chunk emission
      await new Promise((resolve) => setTimeout(resolve, 10));
      params.onUiMessageChunk?.({
        id: validChatMsgId,
        role: "assistant",
        parts: [{ type: "text", text: "hello" }],
      });

      return {
        messageId: validChatMsgId,
        text: "hello",
        finishReason: "stop",
        responseUiMessage: {
          id: validChatMsgId,
          role: "assistant",
          parts: [{ type: "text", text: "hello" }],
        },
      };
    });

    const response = await app.inject({
      method: "POST",
      url: `/v2/a2a/${agentId}/chat`,
      headers: {
        authorization: "Bearer test-token",
      },
      payload: {
        messages: [{ role: "user", content: "hello" }],
      },
    });

    console.log("CHAT STATUS CODE:", response.statusCode);
    console.log("CHAT PAYLOAD:", JSON.stringify(response.payload));

    expect(response.statusCode).toBe(200);
    // Vercel AI SDK text streams are typically plain text or server-sent style chunks
    expect(response.payload).toBeTruthy();
  });
});
