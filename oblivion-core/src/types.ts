/** 一次捕获的处置结果。ignored / duplicate 也必须带 reason，不允许静默丢弃。 */
export type Action = 'created' | 'appended' | 'duplicate' | 'conflict' | 'ignored';

export interface Source {
  type: 'doc' | 'session' | 'url' | 'qa_loop';
  ref: string;
  hash: string;
}

export interface KnowledgeItem {
  id: string;
  topic: string;
  title: string;
  content: string;
  sources: Source[];
  tags: string[];
  status: 'active' | 'conflict' | 'archived';
  impl?: 'implemented' | 'designed' | 'placeholder';
  created_at: number;
  updated_at: number;
  version: number;
}

export interface QAPair {
  question: string;
  answer: string;
  sources: Source[];
  topicHint?: string;
  /** 会话 id + turn 是幂等键的真实来源。 */
  sessionId: string;
  turn: number;
  capturedAt: number;
}

export interface FilterResult {
  pass: boolean;
  action: Action;
  score?: number;
  existing?: KnowledgeItem;
  reason?: string;
}

export interface CooccurrenceEdge {
  source_id: string;
  target_id: string;
  weight: number;
  last_reinforced_at: number;
  reinforce_count: number;
}

export interface EdgeEvent {
  edge_id: string;
  event_type: 'create' | 'reinforce';
  weight_delta: number;
  created_at: number;
}

export interface UserProfile {
  inquiry_style: { primary: string; secondary: string; confidence: number };
  followup_patterns: string[];
  blind_spots: string[];
  receptive_dimensions: string[];
  resistant_dimensions: string[];
  language_style: { tone: string; prefers: string[]; dislikes: string[] };
  active_goals: string[];
  sessions_observed: number;
  user_override?: Partial<UserProfile>;
}

export interface CoverageRecord {
  topic: string;
  session_id: string;
  covered: string[];
  missing: string[];
  created_at: number;
}

export interface FeedbackEntry {
  id: string;
  target: string;
  signal: -1 | 0 | 1;
  context: string;
  created_at: number;
}