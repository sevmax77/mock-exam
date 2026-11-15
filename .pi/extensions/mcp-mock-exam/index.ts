/**
 * MCP client extension: connects pi to the local "mock-exam" MCP server
 * (see ../../../mcp-server) and exposes its `get_random_question` tool as
 * a native pi tool.
 *
 * The MCP server must be running separately:
 *
 *   cd mcp-server
 *   ./.venv/Scripts/python server.py
 *
 * This extension is a minimal generic-ish MCP HTTP client: it connects
 * lazily on first use, reuses the connection across tool calls, and
 * reconnects if the connection drops.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MCP_SERVER_URL = process.env.MOCK_EXAM_MCP_URL ?? "http://127.0.0.1:8765/mcp";

export default function (pi: ExtensionAPI) {
	let client: Client | undefined;
	let connecting: Promise<Client> | undefined;

	async function getClient(opts?: { timeoutMs?: number }): Promise<Client> {
		if (client) return client;
		if (connecting) return connecting;

		connecting = (async () => {
			// No per-connection signal on the transport: a signal set in requestInit would apply to
			// every later request on this connection. The connect timeout is enforced separately.
			const transport = new StreamableHTTPClientTransport(new URL(MCP_SERVER_URL));
			const c = new Client({ name: "pi-mock-exam-extension", version: "0.1.0" });
			let timer: ReturnType<typeof setTimeout> | undefined;
			try {
				const connected = c.connect(transport);
				if (opts?.timeoutMs) {
					await Promise.race([
						connected,
						new Promise<never>((_, reject) => {
							timer = setTimeout(
								() => reject(new Error(`timed out after ${opts.timeoutMs} ms`)),
								opts.timeoutMs,
							);
						}),
					]);
				} else {
					await connected;
				}
			} catch (err) {
				await c.close().catch(() => {});
				throw new Error(
					`Could not reach mock-exam MCP server at ${MCP_SERVER_URL}. ` +
						`Start it with "python server.py" inside mcp-server/, then retry. ` +
						`Original error: ${(err as Error).message}`,
				);
			} finally {
				clearTimeout(timer);
				connecting = undefined;
			}
			client = c;
			return c;
		})();

		return connecting;
	}

	/** Drops the cached connection so the next call reconnects (e.g. after the server restarted). */
	async function resetClient() {
		const stale = client;
		client = undefined;
		await stale?.close().catch(() => {});
	}

	async function callRandomQuestion(signal?: AbortSignal) {
		const c = await getClient({ timeoutMs: 5000 });
		return c.callTool({ name: "get_random_question", arguments: {} }, undefined, { signal });
	}

	const STATUS_KEY = "mock-exam-mcp";

	async function checkConnectivity(ctx: { ui: { setStatus: (key: string, text: string | undefined) => void; notify: (msg: string, level: "info" | "warning" | "error") => void } }, opts?: { announceSuccess?: boolean }) {
		try {
			const c = await getClient({ timeoutMs: 3000 });
			try {
				await c.ping();
			} catch {
				// Cached connection is stale (server restarted); reconnect once.
				await resetClient();
				await (await getClient({ timeoutMs: 3000 })).ping();
			}
			ctx.ui.setStatus(STATUS_KEY, undefined);
			if (opts?.announceSuccess) {
				ctx.ui.notify(`Connected to mock-exam MCP server at ${MCP_SERVER_URL}`, "info");
			}
			return true;
		} catch (err) {
			await resetClient();
			ctx.ui.setStatus(STATUS_KEY, "⚠ mock-exam MCP offline");
			ctx.ui.notify((err as Error).message, "warning");
			return false;
		}
	}

	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI) return;
		await checkConnectivity(ctx);
	});

	pi.on("session_shutdown", async () => {
		await client?.close();
		client = undefined;
	});

	pi.registerTool({
		name: "mock_exam_question",
		label: "Mock Exam Question",
		description:
			"Fetch one random practice exam question from the local mock-exam MCP server. " +
			"Returns the full question text, all answer options, the correct option id(s), " +
			"a per-option explanation of why it is or is not correct, and an overall summary. " +
			"Some questions have exactly one correct option (single-answer) and some have two " +
			"or more (select-all-that-apply); check correct_option_ids to tell which kind it is.",
		promptSnippet: "Fetch a random mock-exam practice question to quiz the user",
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, signal) {
			let result;
			try {
				result = await callRandomQuestion(signal);
			} catch (err) {
				if (signal?.aborted) throw err;
				// The cached connection may be dead (server restarted). Reconnect once and retry.
				await resetClient();
				result = await callRandomQuestion(signal);
			}

			if (result.isError) {
				const message = result.content
					?.map((block) => (block.type === "text" ? block.text : ""))
					.filter(Boolean)
					.join("\n");
				throw new Error(message || "mock-exam MCP server returned an error");
			}

			const text = result.content
				?.map((block) => (block.type === "text" ? block.text : ""))
				.filter(Boolean)
				.join("\n") ?? "(no content returned)";

			return {
				content: [{ type: "text", text }],
				details: { structuredContent: result.structuredContent },
			};
		},
	});

	pi.registerCommand("mock-exam-status", {
		description: "Check connectivity to the mock-exam MCP server",
		handler: async (_args, ctx) => {
			await checkConnectivity(ctx, { announceSuccess: true });
		},
	});
}
