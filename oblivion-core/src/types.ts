/** 一次捕获的处置结果。ignored / duplicate 也必须带 reason，不允许静默丢弃。 */
export type Action = 'created' | 'appended' | 'duplicate' | 'conflict' | 'ignored';

export interface Source {
  type: 'doc' | 'session' | 'url' | 'qa_loop';
  ref: string;
  hash: string;
}

/** 文档/知识条目的版本状态（盲区修正：口径漂移靠它显式标注，而不是靠人记）。 */
export type ItemStatus =
  | 'active'
  | 'conflict'
  | 'archived'
  /** 被同一主题的新版本取代（旧版不删，只降级）。 */
  | 'superseded'
  /** 草稿：还没定稿，读的人要知道它不可引用。 */
  | 'draft';

/** 落地状态：设计书里「26 个包 vs 8 个插件」那类混淆，根因就是缺这个字段。 */
export type ImplStatus = 'implemented' | 'designed' | 'placeholder';

export interface KnowledgeItem {
  id: string;
  topic: string;
  title: string;
  content: string;
  sources: Source[];
  tags: string[];
  status: ItemStatus;
  impl?: ImplStatus;
  /** 若被取代：指向取代它的条目 id（版本链留痕）。 */
  supersededBy?: string;
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