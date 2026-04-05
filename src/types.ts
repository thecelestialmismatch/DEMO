export interface Agent {
  id: string;
  name: string;
  role: string;
  personality: string;
  traits: string[]; // e.g., ["optimistic", "cautious"]
  memory: string[];
  status: 'idle' | 'interacting' | 'thinking';
  group?: string;
  sentiment: number; // -1 to 1
  sentimentHistory: { round: number; value: number }[];
  position?: { x: number; y: number };
}

export interface Relationship {
  source: string;
  target: string;
  type: string;
  strength: number;
}

export interface Interaction {
  id: string;
  round: number;
  from: string;
  to: string;
  content: string;
  sentiment: number;
}

export interface DevTask {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  assignedTo?: string;
  result?: string;
}

export interface Module {
  id: string;
  name: string;
  path: string;
  content: string;
  tests: { name: string; status: 'passed' | 'failed' | 'pending' }[];
  lastModifiedBy?: string;
}

export interface FirewallRule {
  id: string;
  name: string;
  pattern: string;
  type: 'regex' | 'keyword' | 'pii' | 'secret';
  action: 'block' | 'alert' | 'mask';
  enabled: boolean;
  description: string;
}

export interface FirewallLog {
  id: string;
  timestamp: string;
  promptSnippet: string;
  violations: string[];
  blocked: boolean;
  latency: number;
  model?: string;
  hash?: string;
}

export interface SimulationState {
  mode: 'prediction' | 'development' | 'firewall' | 'strategy';
  agents: Agent[];
  relationships: Relationship[];
  interactions: Interaction[];
  tasks: DevTask[];
  modules: Module[];
  currentRound: number;
  maxRounds: number;
  logs: string[];
  report?: string;
  status: 'idle' | 'initializing' | 'running' | 'completed' | 'error';
  firewallLogs: FirewallLog[];
  firewallRules: FirewallRule[];
  isRealProxyEnabled: boolean;
  mlModel: string;
  filterGroup?: string;
  filterStatus?: string;
}

export interface SimulationConfig {
  sourceMaterial: string;
  predictionGoal: string;
  agentCount: number;
}
