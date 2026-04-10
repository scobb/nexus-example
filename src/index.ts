/**
 * nexus-example — LangChain agent with Nexus observability
 *
 * This example shows how to wrap a LangChain agent in Nexus trace + spans
 * so every run is visible in your Nexus dashboard.
 *
 * Run: npm run dev
 * See traces at: https://nexus.keylightdigital.dev/dashboard/traces
 */

import * as dotenv from "dotenv";
import { ChatOpenAI } from "@langchain/openai";
import { AgentExecutor, createReactAgent } from "langchain/agents";
import { DynamicTool } from "@langchain/core/tools";
import { pull } from "langchain/hub";
import type { BasePromptTemplate } from "@langchain/core/prompts";

dotenv.config();

// ─── Nexus client ─────────────────────────────────────────────────────────────
// Minimal fetch-based client for the Nexus REST API.
// Replace with `import { NexusClient } from "@keylightdigital/nexus"` once you
// have the npm package installed.

const NEXUS_BASE = "https://nexus.keylightdigital.dev";

interface NexusTrace {
  trace_id: string;
}

interface NexusSpan {
  span_id: string;
}

async function createTrace(name: string): Promise<NexusTrace> {
  const now = new Date().toISOString();
  const res = await fetch(`${NEXUS_BASE}/api/v1/traces`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.NEXUS_API_KEY}`,
    },
    body: JSON.stringify({
      agent_id: "langchain-research-agent",
      name,
      status: "running",
      started_at: now,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Nexus createTrace failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<NexusTrace>;
}

async function finishTrace(
  traceId: string,
  status: "success" | "error",
  metadata?: Record<string, unknown>
): Promise<void> {
  await fetch(`${NEXUS_BASE}/api/v1/traces/${traceId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.NEXUS_API_KEY}`,
    },
    body: JSON.stringify({
      status,
      ended_at: new Date().toISOString(),
      ...(metadata ? { metadata } : {}),
    }),
  });
}

async function createSpan(
  traceId: string,
  name: string,
  input: unknown,
  output: unknown,
  startedAt: string,
  status: "ok" | "error" = "ok",
  parentSpanId?: string
): Promise<NexusSpan> {
  const res = await fetch(`${NEXUS_BASE}/api/v1/traces/${traceId}/spans`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.NEXUS_API_KEY}`,
    },
    body: JSON.stringify({
      name,
      status,
      started_at: startedAt,
      ended_at: new Date().toISOString(),
      input,
      output,
      ...(parentSpanId ? { parent_span_id: parentSpanId } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Nexus createSpan failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<NexusSpan>;
}

// ─── Tools ────────────────────────────────────────────────────────────────────

// We capture the current traceId so tool spans can be linked to the active trace.
let activeTraceId: string | null = null;

const webSearchTool = new DynamicTool({
  name: "web_search",
  description:
    "Search the web for current information. Input should be a search query string.",
  func: async (query: string) => {
    const spanStart = new Date().toISOString();
    // Simulated search result — swap this for a real search API in production.
    const result = `Search results for "${query}":
1. TypeScript 5.4 introduces new type narrowing improvements and ES2022 targeting by default.
2. The 'using' keyword (explicit resource management) landed in TypeScript 5.2.
3. TypeScript 5.5 adds inferred type predicates from function implementations.`;

    if (activeTraceId) {
      await createSpan(
        activeTraceId,
        "tool:web_search",
        { query },
        { result },
        spanStart
      );
    }
    return result;
  },
});

const calculatorTool = new DynamicTool({
  name: "calculator",
  description:
    "Evaluate a mathematical expression. Input should be a valid math expression like '2 + 2' or '(10 * 3) / 5'.",
  func: async (expression: string) => {
    const spanStart = new Date().toISOString();
    let result: string;
    try {
      // Simple eval — safe for a demo, don't use in production without sandboxing.
      // eslint-disable-next-line no-eval
      result = String(eval(expression));
    } catch (err) {
      result = `Error evaluating expression: ${String(err)}`;
    }

    if (activeTraceId) {
      await createSpan(
        activeTraceId,
        "tool:calculator",
        { expression },
        { result },
        spanStart
      );
    }
    return result;
  },
});

// ─── Main ─────────────────────────────────────────────────────────────────────

async function runAgent(question: string): Promise<void> {
  console.log(`\nQuestion: ${question}\n`);

  // 1. Start a Nexus trace for this agent run
  const traceStart = new Date().toISOString();
  const { trace_id: traceId } = await createTrace(
    `Research: ${question.slice(0, 60)}`
  );
  activeTraceId = traceId;
  console.log(`Nexus trace: https://nexus.keylightdigital.dev/t/${traceId}`);

  let finalAnswer = "";
  let runStatus: "success" | "error" = "success";

  try {
    // 2. Build the LangChain agent
    const llm = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      temperature: 0,
    });

    const tools = [webSearchTool, calculatorTool];

    // Pull the standard ReAct prompt from LangChain hub
    const prompt = (await pull<BasePromptTemplate>(
      "hwchase17/react"
    )) as BasePromptTemplate;

    const agent = await createReactAgent({ llm, tools, prompt });
    const executor = new AgentExecutor({ agent, tools, verbose: false });

    // 3. Run the agent, wrapping the LLM call in a span
    const llmSpanStart = new Date().toISOString();
    const result = await executor.invoke({ input: question });
    await createSpan(
      traceId,
      "llm:react-agent",
      { input: question },
      { output: result.output as string },
      llmSpanStart
    );

    finalAnswer = result.output as string;
    console.log(`\nAnswer: ${finalAnswer}`);
  } catch (err) {
    runStatus = "error";
    console.error("Agent error:", err);

    // Record the error as a span
    await createSpan(
      traceId,
      "error",
      { question },
      { error: String(err) },
      traceStart,
      "error"
    );
  } finally {
    // 4. Close the Nexus trace
    activeTraceId = null;
    await finishTrace(traceId, runStatus, {
      question,
      answer: finalAnswer,
    });
    console.log(`\nTrace complete (${runStatus}) — view at:`);
    console.log(`  https://nexus.keylightdigital.dev/t/${traceId}`);
  }
}

// Run with a sample question
const QUESTION =
  process.argv[2] ??
  "What are the latest features in TypeScript 5.x, and how many major versions have been released since TypeScript 4.0?";

runAgent(QUESTION).catch((err) => {
  console.error(err);
  process.exit(1);
});
