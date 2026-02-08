import type { OpenClawApp } from "./app.ts";
import type { GatewayBrowserClient } from "./gateway.ts";
import { generateUUID } from "./uuid.ts";

export type TeamChatHost = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  teamAgentDrafts: Record<string, string>;
  teamAgentMessages: Record<string, unknown[]>;
  teamAgentSending: Record<string, boolean>;
};

export function handleTeamAgentDraftChange(host: TeamChatHost, agentId: string, draft: string) {
  host.teamAgentDrafts = {
    ...host.teamAgentDrafts,
    [agentId]: draft,
  };
}

export async function handleTeamAgentSend(host: TeamChatHost, agentId: string) {
  if (!host.client || !host.connected) {
    console.error("Not connected to gateway");
    return;
  }

  const draft = host.teamAgentDrafts[agentId] ?? "";
  const message = draft.trim();
  if (!message) {
    return;
  }

  // Set sending state
  host.teamAgentSending = {
    ...host.teamAgentSending,
    [agentId]: true,
  };

  // Clear the draft
  host.teamAgentDrafts = {
    ...host.teamAgentDrafts,
    [agentId]: "",
  };

  // Add user message to local state
  const now = Date.now();
  const currentMessages = host.teamAgentMessages[agentId] ?? [];
  host.teamAgentMessages = {
    ...host.teamAgentMessages,
    [agentId]: [
      ...currentMessages,
      {
        role: "user",
        content: [{ type: "text", text: message }],
        timestamp: now,
      },
    ],
  };

  // Construct session key for this agent
  // Format: agent:agentId:sessionId
  const sessionKey = `agent:${agentId}:team-chat`;
  const runId = generateUUID();

  try {
    // Send message to the agent
    await host.client.request("chat.send", {
      sessionKey,
      message,
      deliver: false,
      idempotencyKey: runId,
    });

    // Poll for the response - agent may take time to respond
    // Try a few times with increasing delays
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 1000 : 2000));

      const res = await host.client.request<{ messages?: Array<unknown> }>("chat.history", {
        sessionKey,
        limit: 50,
      });

      if (res.messages && Array.isArray(res.messages)) {
        host.teamAgentMessages = {
          ...host.teamAgentMessages,
          [agentId]: res.messages,
        };
        
        // Check if we got a response (more messages than we sent)
        const lastMsg = res.messages[res.messages.length - 1] as { role?: string } | undefined;
        if (lastMsg?.role === "assistant") {
          break; // Got response, stop polling
        }
      }
    }
  } catch (err) {
    console.error(`Error sending message to agent ${agentId}:`, err);
    // Add error message to chat
    const currentMessages = host.teamAgentMessages[agentId] ?? [];
    host.teamAgentMessages = {
      ...host.teamAgentMessages,
      [agentId]: [
        ...currentMessages,
        {
          role: "assistant",
          content: [{ type: "text", text: `Error: ${String(err)}` }],
          timestamp: Date.now(),
        },
      ],
    };
  } finally {
    // Clear sending state
    host.teamAgentSending = {
      ...host.teamAgentSending,
      [agentId]: false,
    };
  }
}

export async function loadTeamAgentHistory(
  host: TeamChatHost,
  agentId: string,
): Promise<void> {
  if (!host.client || !host.connected) {
    return;
  }

  const sessionKey = `agent:${agentId}:team-chat`;

  try {
    const res = await host.client.request<{ messages?: Array<unknown> }>("chat.history", {
      sessionKey,
      limit: 50,
    });

    if (res.messages && Array.isArray(res.messages)) {
      host.teamAgentMessages = {
        ...host.teamAgentMessages,
        [agentId]: res.messages,
      };
    }
  } catch (err) {
    console.error(`Error loading history for agent ${agentId}:`, err);
  }
}
