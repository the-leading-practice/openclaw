import { html, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import type { AgentsListResult, SessionsListResult } from "../types.ts";
import { formatRelativeTimestamp } from "../format.ts";

export type TeamProps = {
  loading: boolean;
  error: string | null;
  agentsList: AgentsListResult | null;
  sessions: SessionsListResult | null;
  // Agent chat states - keyed by agent ID
  agentDrafts: Record<string, string>;
  agentMessages: Record<string, unknown[]>;
  agentSending: Record<string, boolean>;
  onRefresh: () => void;
  onAgentDraftChange: (agentId: string, draft: string) => void;
  onAgentSend: (agentId: string) => void;
};

function normalizeAgentLabel(agent: { id: string; name?: string; identity?: { name?: string } }) {
  return agent.name?.trim() || agent.identity?.name?.trim() || agent.id;
}

function isLikelyEmoji(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 16) {
    return false;
  }
  let hasNonAscii = false;
  for (let i = 0; i < trimmed.length; i += 1) {
    if (trimmed.charCodeAt(i) > 127) {
      hasNonAscii = true;
      break;
    }
  }
  if (!hasNonAscii) {
    return false;
  }
  if (trimmed.includes("://") || trimmed.includes("/") || trimmed.includes(".")) {
    return false;
  }
  return true;
}

function resolveAgentEmoji(agent: { identity?: { emoji?: string; avatar?: string } }) {
  const emoji = agent.identity?.emoji?.trim();
  if (emoji && isLikelyEmoji(emoji)) {
    return emoji;
  }
  const avatar = agent.identity?.avatar?.trim();
  if (avatar && isLikelyEmoji(avatar)) {
    return avatar;
  }
  return "";
}

function getAgentSessions(agentId: string, sessions: SessionsListResult | null) {
  if (!sessions) {
    return [];
  }
  return sessions.sessions.filter((session) => {
    // Match sessions that belong to this agent
    // Sessions might be identified by agentId in the key or other properties
    return session.key.startsWith(`${agentId}:`) || session.agentId === agentId;
  });
}

function renderAgentCard(agent: AgentsListResult["agents"][number], props: TeamProps) {
  const agentId = agent.id;
  const displayName = normalizeAgentLabel(agent);
  const emoji = resolveAgentEmoji(agent);
  const draft = props.agentDrafts[agentId] ?? "";
  const messages = props.agentMessages[agentId] ?? [];
  const sending = props.agentSending[agentId] ?? false;
  const agentSessions = getAgentSessions(agentId, props.sessions);

  return html`
    <div class="team-agent-card">
      <div class="team-agent-header">
        <div class="team-agent-avatar">
          ${emoji || displayName.slice(0, 1)}
        </div>
        <div class="team-agent-info">
          <div class="team-agent-name">${displayName}</div>
          <div class="team-agent-id mono">${agentId}</div>
          ${
            agentSessions.length > 0
              ? html`
                  <div class="team-agent-session-count muted">
                    ${agentSessions.length} active session${agentSessions.length !== 1 ? "s" : ""}
                  </div>
                `
              : html`
                  <div class="team-agent-session-count muted">No active sessions</div>
                `
          }
        </div>
      </div>

      <div class="team-agent-chat">
        <div class="team-agent-messages">
          ${
            messages.length === 0
              ? html`
                  <div class="muted" style="padding: 12px;">No messages yet. Start a conversation below.</div>
                `
              : repeat(
                  messages,
                  (msg: any, index) => `${agentId}-msg-${index}`,
                  (msg: any) => html`
                    <div class="team-message team-message--${msg.role ?? "user"}">
                      <div class="team-message-role">${msg.role ?? "user"}</div>
                      <div class="team-message-content">
                        ${typeof msg.content === "string"
                          ? msg.content
                          : Array.isArray(msg.content)
                            ? msg.content.map((part: any) => (typeof part === "string" ? part : part.text ?? "")).join(" ")
                            : ""}
                      </div>
                    </div>
                  `,
                )
          }
        </div>

        <div class="team-agent-input">
          <textarea
            class="team-input-field"
            placeholder="Message ${displayName}..."
            .value=${draft}
            ?disabled=${sending}
            @input=${(e: Event) => props.onAgentDraftChange(agentId, (e.target as HTMLTextAreaElement).value)}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!sending && draft.trim()) {
                  props.onAgentSend(agentId);
                }
              }
            }}
          ></textarea>
          <button
            class="btn btn--sm primary"
            ?disabled=${sending || !draft.trim()}
            @click=${() => props.onAgentSend(agentId)}
          >
            ${sending ? "Sending..." : "Send"}
          </button>
        </div>
      </div>

      ${
        agentSessions.length > 0
          ? html`
              <details class="team-agent-sessions">
                <summary>Active Sessions (${agentSessions.length})</summary>
                <div class="team-sessions-list">
                  ${agentSessions.map(
                    (session) => html`
                      <div class="team-session-item">
                        <div class="team-session-key mono">${session.key}</div>
                        ${session.label ? html`<div class="team-session-label">${session.label}</div>` : nothing}
                        <div class="team-session-meta muted">
                          Updated ${session.updatedAt ? formatRelativeTimestamp(session.updatedAt) : "n/a"}
                        </div>
                      </div>
                    `,
                  )}
                </div>
              </details>
            `
          : nothing
      }
    </div>
  `;
}

export function renderTeam(props: TeamProps) {
  const agents = props.agentsList?.agents ?? [];

  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Team Dashboard</div>
          <div class="card-sub">Chat with all ${agents.length} agents and monitor their active sessions.</div>
        </div>
        <button class="btn btn--sm" ?disabled=${props.loading} @click=${props.onRefresh}>
          ${props.loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      ${props.error ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>` : nothing}

      <div class="team-grid" style="margin-top: 20px;">
        ${
          agents.length === 0
            ? html`
                <div class="muted">No agents found. Configure agents in the Agents tab.</div>
              `
            : agents.map((agent) => renderAgentCard(agent, props))
        }
      </div>
    </section>
  `;
}
