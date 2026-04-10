# nexus-example

[![Nexus](https://img.shields.io/badge/observability-Nexus-6366f1)](https://nexus.keylightdigital.dev)
[![LangChain](https://img.shields.io/badge/framework-LangChain-1c3c3c)](https://js.langchain.com)
[![TypeScript](https://img.shields.io/badge/language-TypeScript-3178c6)](https://www.typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

A minimal TypeScript project showing how to instrument a **LangChain ReAct agent** with **[Nexus](https://nexus.keylightdigital.dev)** — trace every agent run, see every tool call, and debug failures in seconds.

> **Nexus** is the "Plausible Analytics for AI agents" — lightweight, privacy-friendly observability built on Cloudflare.

---

## What you'll see in the dashboard

After running the example you'll find a trace like this in your [Nexus dashboard](https://nexus.keylightdigital.dev/dashboard/traces):

```
Research: What are the latest features in TypeScript 5.x…   success  1.2s
  ├── llm:react-agent           ok    1.1s   input: {question}   output: {answer}
  ├── tool:web_search           ok    12ms   input: {query}      output: {result}
  └── tool:calculator           ok    <1ms   input: {expr}       output: {result}
```

Each span shows its name, status, duration, inputs, and outputs — no extra setup required.

---

## Prerequisites

- Node.js 18+
- An OpenAI API key — [get one here](https://platform.openai.com/api-keys)
- A free Nexus account — [sign up here](https://nexus.keylightdigital.dev/register) (takes 30 seconds, no credit card)

---

## Run in 2 minutes

### 1. Clone the repo

```bash
git clone https://github.com/scobb/nexus-example.git
cd nexus-example
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure your API keys

```bash
cp .env.example .env
```

Open `.env` and fill in:

```env
NEXUS_API_KEY=nxs_your_api_key_here    # from nexus.keylightdigital.dev/dashboard/keys
OPENAI_API_KEY=sk-your_key_here        # from platform.openai.com/api-keys
```

**Get your Nexus API key:**
1. Go to [nexus.keylightdigital.dev/register](https://nexus.keylightdigital.dev/register)
2. Sign in with your email (magic link, no password)
3. Go to **Dashboard → API Keys → Create new key**
4. Copy the key into your `.env`

### 4. Run the agent

```bash
npm run dev
```

You'll see output like:

```
Question: What are the latest features in TypeScript 5.x?

Nexus trace: https://nexus.keylightdigital.dev/t/abc123...

Answer: TypeScript 5.x introduced several improvements including...

Trace complete (success) — view at:
  https://nexus.keylightdigital.dev/t/abc123...
```

Click the trace URL to see the full span waterfall in your dashboard.

### 5. Ask your own question

```bash
npm run dev -- "How many planets are in the solar system, and what is 8 * 365?"
```

---

## How it works

The instrumentation is three function calls around your existing agent code:

```typescript
// 1. Start a trace (marks the run as "running")
const { trace_id } = await createTrace("Research: my question");

// 2. Run your LangChain agent normally
const result = await executor.invoke({ input: question });

// 3. Record spans for LLM calls and tool calls
await createSpan(traceId, "llm:react-agent", { input }, { output }, startedAt);

// 4. Finish the trace (marks it "success" or "error")
await finishTrace(traceId, "success");
```

Each tool (`web_search`, `calculator`) also records its own span so you can see exactly what data was retrieved and how long each tool took.

See [`src/index.ts`](./src/index.ts) for the full annotated implementation.

---

## Project structure

```
nexus-example/
├── src/
│   └── index.ts        # LangChain agent + Nexus instrumentation
├── .env.example        # API key placeholders
├── package.json
├── tsconfig.json
└── README.md
```

---

## Adapting this to your agent

1. Replace the `web_search` and `calculator` tools with your own tools
2. Change `agent_id: "langchain-research-agent"` to a meaningful name for your agent
3. Add `metadata` to `finishTrace()` to capture any run-level context (user ID, session ID, etc.)

For more frameworks (CrewAI, DSPy, LlamaIndex, Anthropic SDK) see the [Nexus docs](https://nexus.keylightdigital.dev/docs).

---

## Links

- **[Nexus dashboard](https://nexus.keylightdigital.dev/dashboard)** — view your traces
- **[Nexus docs](https://nexus.keylightdigital.dev/docs)** — API reference + SDK quickstarts
- **[Nexus repo](https://github.com/scobb/nexus)** — the open-source Nexus control plane
- **[LangChain JS docs](https://js.langchain.com/docs)** — LangChain TypeScript documentation

---

## License

MIT — use freely, attribution appreciated.
