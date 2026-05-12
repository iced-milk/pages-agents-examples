// --- SSE Event Types ---
export interface SSEEvent {
  type: 'flow_start' | 'agent_start' | 'agent_end' | 'chunk' | 'tool_call' | 'error' | 'done';
  agent?: string;
  task?: string;
  task_name?: string;
  task_index?: number;
  content?: string;
  product_name?: string;
  message?: string;
  status?: string;
  tool_name?: string;
  arguments?: string;
}

// --- Agent Config ---
export interface AgentConfig {
  avatar: string;
  color: string;
  crewTagKey: string;
  shortNameKey: string;  // i18n key for short display name (timeline + header)
}

export const AGENT_CONFIG: Record<string, AgentConfig> = {
  'Senior Product Manager': {
    avatar: '👩‍💼',
    color: 'var(--agent-pm)',
    crewTagKey: 'crew1.tag',
    shortNameKey: 'agent.pm',
  },
  'Senior Tech Lead': {
    avatar: '👨‍💻',
    color: 'var(--agent-dev)',
    crewTagKey: 'crew1.tag',
    shortNameKey: 'agent.dev',
  },
  'VP of Product': {
    avatar: '👔',
    color: 'var(--agent-boss)',
    crewTagKey: 'crew2.tag',
    shortNameKey: 'agent.boss',
  },
};

// --- App State ---
export type FlowStatus = 'idle' | 'running' | 'completed' | 'error';

export type ChatItem =
  | { type: 'system'; text: string }
  | { type: 'divider'; agent: string }
  | { type: 'message'; agent: string; status: 'running' | 'completed'; content: string; startTime: number; elapsed?: string };

// --- Timeline ---
export interface AgentTimelineNode {
  role: string;
  status: 'pending' | 'running' | 'completed';
}
