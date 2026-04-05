import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  Play, 
  MessageSquare, 
  FileText, 
  Users, 
  Activity, 
  ChevronRight, 
  X, 
  Send,
  Loader2,
  BrainCircuit,
  Network,
  History,
  Settings2,
  TrendingUp,
  Filter,
  Plus,
  Trash2,
  Terminal,
  Code2,
  CheckCircle2,
  AlertCircle,
  Layout,
  Cpu,
  ShieldAlert,
  ShieldCheck,
  Rocket,
  BarChart3,
  Target,
  Zap,
  LayoutDashboard,
  Shield,
  Lock,
  Clock,
  BarChart,
  PieChart,
  Settings,
  AlertTriangle,
  Eye,
  EyeOff,
  Save,
  PlusCircle,
  Power
} from 'lucide-react';
import Markdown from 'react-markdown';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart as RechartsBarChart,
  Bar,
  Cell,
  PieChart as RechartsPieChart,
  Pie
} from 'recharts';
import { SimulationGraph } from './components/SimulationGraph';
import { SentimentTimeline } from './components/SentimentTimeline';
import { Agent, Relationship, SimulationState, SimulationConfig, Interaction, DevTask, Module } from './types';
import { extractActors, generatePredictionReport, getAgentResponse, simulateInteraction, planDevelopmentTasks, generateModuleCode } from './services/geminiService';
import { cn } from './lib/utils';

import { supabase } from './supabase';
import { User } from '@supabase/supabase-js';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center">
          <div className="max-w-md">
            <div className="w-16 h-16 bg-rose-500/20 rounded-2xl flex items-center justify-center mb-6 mx-auto border border-rose-500/30">
              <AlertTriangle size={32} className="text-rose-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-4">Something went wrong</h2>
            <p className="text-slate-400 mb-8 text-sm">
              The application encountered an unexpected error. This might be due to a security violation or a network issue.
            </p>
            <pre className="bg-slate-900 p-4 rounded-xl text-[10px] text-rose-300 font-mono text-left overflow-auto max-h-40 mb-8 border border-white/5">
              {this.state.error?.message || String(this.state.error)}
            </pre>
            <button 
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-white text-slate-950 rounded-xl font-bold hover:bg-slate-200 transition-all"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const PREDEFINED_PATTERNS = [
  { id: 'custom', label: 'Custom Regex', pattern: '', type: 'regex' as const },
  { id: 'aws_key', label: 'AWS Access Key', pattern: 'AKIA[0-9A-Z]{16}', type: 'secret' as const },
  { id: 'credit_card', label: 'Credit Card Number', pattern: '\\b(?:\\d[ -]*?){13,16}\\b', type: 'pii' as const },
  { id: 'email', label: 'Email Address', pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}', type: 'pii' as const },
  { id: 'ssn', label: 'Social Security Number', pattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b', type: 'pii' as const },
  { id: 'phone', label: 'US Phone Number', pattern: '\\b\\d{3}[-.]?\\d{3}[-.]?\\d{4}\\b', type: 'pii' as const },
  { id: 'ipv4', label: 'IP Address (IPv4)', pattern: '\\b(?:[0-9]{1,3}\\.){3}[0-9]{1,3}\\b', type: 'pii' as const },
  { id: 'code_leak', label: 'Proprietary Code Leak', pattern: '\\b(?:class|function|const|let|var)\\s+[a-zA-Z0-9_]+\\s*=?\\s*\\(?.*\\)?\\s*=>?\\s*\\{', type: 'keyword' as const },
];

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const [config, setConfig] = useState<SimulationConfig>({
    sourceMaterial: '',
    predictionGoal: '',
    agentCount: 10
  });

  const [state, setState] = useState<SimulationState>({
    mode: 'prediction',
    agents: [],
    relationships: [],
    interactions: [],
    tasks: [],
    modules: [],
    currentRound: 0,
    maxRounds: 5,
    logs: [],
    status: 'idle',
    firewallLogs: [],
    firewallRules: [],
    isRealProxyEnabled: true,
    mlModel: 'gemini-3-flash-preview'
  });

  // Auth Listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      setIsAuthReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Real-time Firewall Listeners (Polling API)
  useEffect(() => {
    if (!user) return;

    const fetchFirewallData = async () => {
      try {
        const [logsRes, rulesRes, mlModelRes] = await Promise.all([
          fetch('/api/firewall/logs'),
          fetch('/api/firewall/rules'),
          fetch('/api/firewall/ml-model')
        ]);
        if (logsRes.ok) {
          const logs = await logsRes.json();
          setState(prev => ({ ...prev, firewallLogs: logs }));
        }
        if (rulesRes.ok) {
          const rules = await rulesRes.json();
          if (rules.length > 0) {
            setState(prev => ({ ...prev, firewallRules: rules }));
          }
        }
        if (mlModelRes.ok) {
          const { model } = await mlModelRes.json();
          setState(prev => ({ ...prev, mlModel: model }));
        }
      } catch (e) {
        console.error("Failed to fetch firewall data", e);
      }
    };

    fetchFirewallData();
    const interval = setInterval(fetchFirewallData, 5000); // Poll every 5 seconds

    return () => {
      clearInterval(interval);
    };
  }, [user]);

  const handleLogin = async () => {
    try {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  // Simulation Persistence
  useEffect(() => {
    if (!user || state.agents.length === 0) return;
    
    const saveState = async () => {
      try {
        await supabase.from('simulations').upsert({
          id: user.id,
          agents: state.agents,
          relationships: state.relationships,
          interactions: state.interactions,
          tasks: state.tasks,
          modules: state.modules,
          logs: state.logs,
          status: state.status,
          mode: state.mode,
          currentRound: state.currentRound,
          lastUpdated: new Date().toISOString(),
          ownerId: user.id
        });
      } catch (error) {
        console.error("Failed to save simulation", error);
      }
    };

    const timeout = setTimeout(saveState, 2000); // Debounce saves
    return () => clearTimeout(timeout);
  }, [state.agents, state.relationships, state.interactions, state.tasks, state.modules, state.logs, state.status, state.mode, state.currentRound, user]);

  // Load Simulation on mount
  useEffect(() => {
    if (!user) return;

    const loadState = async () => {
      try {
        const { data, error } = await supabase.from('simulations').select('*').eq('id', user.id).single();
        if (error) throw error;
        if (data) {
          setState(prev => ({
            ...prev,
            ...data,
            firewallLogs: prev.firewallLogs, // Keep firewall data separate
            firewallRules: prev.firewallRules
          }));
        }
      } catch (error) {
        console.error("Failed to load simulation", error);
      }
    };

    loadState();
  }, [user]);

  const handleLogout = () => supabase.auth.signOut();

  const handleDatabaseError = (error: unknown, operationType: string, path: string | null) => {
    const errInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: user?.id,
        email: user?.email,
      },
      operationType,
      path
    };
    console.error('Database Error: ', JSON.stringify(errInfo));
  };

  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'agent', content: string }[]>([]);
  const [isChatting, setIsChatting] = useState(false);
  const [activeTab, setActiveTab] = useState<'graph' | 'timeline' | 'interactions' | 'tasks' | 'codebase' | 'firewall_logs' | 'firewall_rules' | 'firewall_dashboard' | 'audit' | 'prd' | 'roadmap' | 'strategy'>('firewall_dashboard');
  const [showReport, setShowReport] = useState(false);
  const [filterGroup, setFilterGroup] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [showConfigModal, setShowConfigModal] = useState(false);

  // Firewall Rule Management State
  const [isAddingRule, setIsAddingRule] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleForm, setRuleForm] = useState<{
    name: string;
    pattern: string;
    type: 'regex' | 'keyword' | 'pii' | 'secret';
    action: 'block' | 'alert' | 'mask';
    enabled: boolean;
    description: string;
  }>({
    name: '',
    pattern: '',
    type: 'regex',
    action: 'block',
    enabled: true,
    description: ''
  });
  const [regexTestString, setRegexTestString] = useState('');
  const [showTestInput, setShowTestInput] = useState(false);

  const groups = useMemo(() => {
    const s = new Set(state.agents.map(a => a.group).filter(Boolean));
    return Array.from(s) as string[];
  }, [state.agents]);

  const initializeSimulation = async () => {
    if (!config.sourceMaterial || !config.predictionGoal) return;

    setState(prev => ({ ...prev, status: 'initializing', logs: [`Initializing ${prev.mode} simulation...`] }));

    try {
      if (state.mode === 'prediction') {
        const actors = await extractActors(config.sourceMaterial);
        
        const initialAgents: Agent[] = actors.map((actor, i) => ({
          id: `agent-${i}`,
          name: actor.name,
          role: actor.role,
          personality: actor.description,
          traits: actor.traits,
          group: actor.group,
          memory: [`Initialized as ${actor.name}, ${actor.role}.`],
          status: 'idle',
          sentiment: 0,
          sentimentHistory: [{ round: 0, value: 0 }]
        }));

        const initialRelationships: Relationship[] = [];
        for (let i = 0; i < initialAgents.length; i++) {
          for (let j = i + 1; j < initialAgents.length; j++) {
            if (Math.random() > 0.4) {
              initialRelationships.push({
                source: initialAgents[i].id,
                target: initialAgents[j].id,
                type: 'neutral',
                strength: 0.5
              });
            }
          }
        }

        setState(prev => ({
          ...prev,
          agents: initialAgents,
          relationships: initialRelationships,
          interactions: [],
          status: 'idle',
          currentRound: 0,
          logs: [...prev.logs, `Extracted ${initialAgents.length} agents. You can now customize them.`]
        }));
        setShowConfigModal(true);
      } else {
        // Development Mode Initialization
        const tasks = await planDevelopmentTasks(config.predictionGoal);
        const initialAgents: Agent[] = Array.from({ length: 5 }, (_, i) => ({
          id: `claw-${i}`,
          name: `Claw-${i + 1}`,
          role: 'Autonomous Developer',
          personality: 'Efficient, logical, and focused on code quality.',
          traits: ['precise', 'fast', 'thorough'],
          group: 'Claws',
          memory: ['Initialized for autonomous development.'],
          status: 'idle',
          sentiment: 1,
          sentimentHistory: [{ round: 0, value: 1 }]
        }));

        setState(prev => ({
          ...prev,
          agents: initialAgents,
          tasks: tasks.map((t, i) => ({ ...t, id: `task-${i}`, status: 'pending' })),
          modules: [],
          status: 'idle',
          currentRound: 0,
          logs: [...prev.logs, `Planned ${tasks.length} development tasks. Claws are ready.`]
        }));
        setActiveTab('tasks');
      }

    } catch (error) {
      console.error(error);
      setState(prev => ({ ...prev, status: 'error', logs: [...prev.logs, 'An error occurred during initialization.'] }));
    }
  };

  const runSimulation = async () => {
    setState(prev => ({ ...prev, status: 'running', currentRound: 1 }));

    try {
      if (state.mode === 'prediction') {
        for (let round = 1; round <= state.maxRounds; round++) {
          setState(prev => ({ 
            ...prev, 
            currentRound: round,
            logs: [...prev.logs, `Round ${round}: Simulating agent interactions...`]
          }));

          // Select random pairs for interaction
          const pairs: [number, number][] = [];
          const indices = Array.from({ length: state.agents.length }, (_, i) => i);
          for (let i = 0; i < Math.min(5, state.agents.length / 2); i++) {
            const idx1 = indices.splice(Math.floor(Math.random() * indices.length), 1)[0];
            const idx2 = indices.splice(Math.floor(Math.random() * indices.length), 1)[0];
            pairs.push([idx1, idx2]);
          }

          const newInteractions: Interaction[] = [];
          const updatedAgents = [...state.agents];

          for (const [idx1, idx2] of pairs) {
            const agentA = updatedAgents[idx1];
            const agentB = updatedAgents[idx2];
            
            const result = await simulateInteraction(agentA, agentB, config.sourceMaterial, config.predictionGoal, round);
            
            newInteractions.push({
              id: `int-${round}-${idx1}-${idx2}`,
              round,
              from: agentA.id,
              to: agentB.id,
              content: result.content,
              sentiment: result.sentiment
            });

            // Update agent states
            updatedAgents[idx1] = {
              ...agentA,
              memory: [...agentA.memory, `Round ${round}: Spoke with ${agentB.name}. ${result.content}`],
              sentiment: (agentA.sentiment + result.sentiment) / 2,
              sentimentHistory: [...agentA.sentimentHistory, { round, value: (agentA.sentiment + result.sentiment) / 2 }]
            };
            updatedAgents[idx2] = {
              ...agentB,
              memory: [...agentB.memory, `Round ${round}: Spoke with ${agentA.name}. ${result.content}`],
              sentiment: (agentB.sentiment + result.sentiment) / 2,
              sentimentHistory: [...agentB.sentimentHistory, { round, value: (agentB.sentiment + result.sentiment) / 2 }]
            };
          }

          setState(prev => ({
            ...prev,
            agents: updatedAgents,
            interactions: [...prev.interactions, ...newInteractions],
            logs: [...prev.logs, `Round ${round} complete. ${newInteractions.length} interactions processed.`]
          }));

          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } else {
        // Development Mode Simulation
        const pendingTasks = [...state.tasks];
        const agents = [...state.agents];
        const modules: Module[] = [];

        for (let round = 1; round <= state.maxRounds; round++) {
          setState(prev => ({ 
            ...prev, 
            currentRound: round,
            logs: [...prev.logs, `Round ${round}: Claws picking up tasks...`]
          }));

          for (let i = 0; i < agents.length; i++) {
            const taskIdx = pendingTasks.findIndex(t => t.status === 'pending');
            if (taskIdx === -1) break;

            const task = pendingTasks[taskIdx];
            const agent = agents[i];
            
            pendingTasks[taskIdx] = { ...task, status: 'in-progress', assignedTo: agent.id };
            setState(prev => ({ ...prev, tasks: [...pendingTasks], logs: [...prev.logs, `${agent.name} started task: ${task.title}`] }));

            // Simulate code generation
            const result = await generateModuleCode(agent, task, config.sourceMaterial);
            
            const newModule: Module = {
              id: `mod-${modules.length}`,
              name: result.name,
              path: result.path,
              content: result.content,
              tests: result.tests.map(t => ({ name: t, status: Math.random() > 0.2 ? 'passed' : 'failed' })),
              lastModifiedBy: agent.id
            };

            modules.push(newModule);
            pendingTasks[taskIdx] = { ...task, status: 'completed', assignedTo: agent.id, result: `Built ${result.name}` };
            
            setState(prev => ({ 
              ...prev, 
              tasks: [...pendingTasks], 
              modules: [...modules],
              logs: [...prev.logs, `${agent.name} completed task: ${task.title}. Tests: ${newModule.tests.filter(t => t.status === 'passed').length}/${newModule.tests.length} passed.`]
            }));

            await new Promise(resolve => setTimeout(resolve, 800));
          }

          if (pendingTasks.every(t => t.status === 'completed')) break;
        }
      }

      setState(prev => ({ ...prev, status: 'completed', logs: [...prev.logs, 'Simulation complete. Generating report...'] }));
      const report = await generatePredictionReport(config, state.agents, state.logs);
      setState(prev => ({ ...prev, report }));
      setShowReport(true);

    } catch (error) {
      console.error(error);
      setState(prev => ({ ...prev, status: 'error', logs: [...prev.logs, 'An error occurred during simulation.'] }));
    }
  };


  const addFirewallRule = async () => {
    try {
      if (editingRuleId) {
        await updateFirewallRule(editingRuleId, ruleForm);
      } else {
        const response = await fetch('/api/firewall/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ruleForm)
        });
        const newRule = await response.json();
        setState(prev => ({ ...prev, firewallRules: [...prev.firewallRules, newRule] }));
      }
      setIsAddingRule(false);
      setEditingRuleId(null);
      setRuleForm({ name: '', pattern: '', type: 'regex', action: 'block', enabled: true, description: '' });
      setRegexTestString('');
      setShowTestInput(false);
    } catch (error) {
      console.error('Failed to save rule:', error);
    }
  };

  const updateFirewallRule = async (id: string, updates: any) => {
    try {
      await fetch(`/api/firewall/rules/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      setState(prev => ({
        ...prev,
        firewallRules: prev.firewallRules.map(r => r.id === id ? { ...r, ...updates } : r)
      }));
      setEditingRuleId(null);
    } catch (error) {
      console.error('Failed to update rule:', error);
    }
  };

  const deleteFirewallRule = async (id: string) => {
    try {
      await fetch(`/api/firewall/rules/${id}`, { method: 'DELETE' });
      setState(prev => ({
        ...prev,
        firewallRules: prev.firewallRules.filter(r => r.id !== id)
      }));
    } catch (error) {
      console.error('Failed to delete rule:', error);
    }
  };


  const applyComplianceTemplate = async (type: 'hipaa' | 'soc2') => {
    try {
      const response = await fetch(`/api/firewall/templates/${type}`, { method: 'POST' });
      const result = await response.json();
      if (result.success) {
        const rulesRes = await fetch('/api/firewall/rules');
        const rules = await rulesRes.json();
        setState(prev => ({ ...prev, firewallRules: rules }));
      }
    } catch (error) {
      console.error('Failed to apply template:', error);
    }
  };

  const exportLogs = (format: 'csv' | 'json') => {
    const logs = state.firewallLogs;
    if (format === 'json') {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(logs, null, 2));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href",     dataStr);
      downloadAnchorNode.setAttribute("download", "kaelus_audit_logs.json");
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
    } else {
      const headers = ['id', 'timestamp', 'blocked', 'latency', 'model', 'violations', 'promptSnippet', 'hash'];
      const csvContent = [
        headers.join(','),
        ...logs.map(log => headers.map(h => {
          let val = (log as any)[h];
          if (Array.isArray(val)) val = val.join(';');
          if (typeof val === 'string') val = `"${val.replace(/"/g, '""')}"`;
          return val;
        }).join(','))
      ].join('\n');
      
      const dataStr = "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent);
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href",     dataStr);
      downloadAnchorNode.setAttribute("download", "kaelus_audit_logs.csv");
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
    }
  };

  const handleSendMessage = async () => {
    if (!selectedAgent || !chatMessage) return;

    const userMsg = chatMessage;
    setChatMessage('');
    setChatHistory(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsChatting(true);

    try {
      const response = await getAgentResponse(selectedAgent, userMsg, config.sourceMaterial);
      setChatHistory(prev => [...prev, { role: 'agent', content: response }]);
      
      // Interaction influences the agent
      setState(prev => {
        const updatedAgents = prev.agents.map(a => {
          if (a.id === selectedAgent.id) {
            return {
              ...a,
              memory: [...a.memory, `User interaction: ${userMsg}. Response: ${response}`],
              // User interaction slightly shifts sentiment towards neutral or positive if helpful
              sentiment: (a.sentiment + 0.1) / 1.1 
            };
          }
          return a;
        });
        return { ...prev, agents: updatedAgents };
      });

    } catch (error) {
      console.error(error);
    } finally {
      setIsChatting(false);
    }
  };

  const updateAgent = (id: string, updates: Partial<Agent>) => {
    setState(prev => ({
      ...prev,
      agents: prev.agents.map(a => a.id === id ? { ...a, ...updates } : a)
    }));
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(30,58,138,0.2),transparent_70%)]" />
        <div className="relative z-10 text-center max-w-md w-full">
          <div className="mb-8 flex justify-center">
            <div className="w-20 h-20 bg-blue-600/20 rounded-3xl flex items-center justify-center border border-blue-500/30 shadow-[0_0_50px_-12px_rgba(59,130,246,0.5)]">
              <ShieldCheck size={40} className="text-blue-400" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-white mb-4 tracking-tight">Kaelus</h1>
          <p className="text-slate-400 mb-12 text-lg">The Enterprise AI Security Gateway & Simulation Engine</p>
          
          <button 
            onClick={handleLogin}
            className="w-full py-4 px-6 bg-white text-slate-950 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-slate-200 transition-all active:scale-95 shadow-xl"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
            Sign in with Google
          </button>
          
          <p className="mt-8 text-xs text-slate-500">
            Secure, persistent, and enterprise-ready.
          </p>
        </div>
      </div>
    );
  }

  let isRegexValid = true;
  let regexError = '';
  let isMatch = false;

  if (ruleForm.pattern) {
    try {
      const regex = new RegExp(ruleForm.pattern);
      if (regexTestString) {
        isMatch = regex.test(regexTestString);
      }
    } catch (e) {
      isRegexValid = false;
      regexError = e instanceof Error ? e.message : 'Invalid regular expression';
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-blue-500/30">
      {/* Sidebar */}
      <div className="fixed left-0 top-0 bottom-0 w-20 bg-slate-900/50 border-r border-white/5 flex flex-col items-center py-8 z-50 backdrop-blur-xl">
        <div className="w-12 h-12 bg-blue-600/20 rounded-2xl flex items-center justify-center mb-12 border border-blue-500/30 shadow-[0_0_20px_-5px_rgba(59,130,246,0.5)]">
          <ShieldCheck size={24} className="text-blue-400" />
        </div>
        
        <div className="flex-1 flex flex-col gap-6">
          <SidebarIcon icon={<LayoutDashboard size={20} />} active={activeTab === 'firewall_dashboard'} onClick={() => setActiveTab('firewall_dashboard')} tooltip="Dashboard" />
          <SidebarIcon icon={<Activity size={20} />} active={activeTab === 'graph'} onClick={() => setActiveTab('graph')} tooltip="Simulation" />
          <SidebarIcon icon={<Shield size={20} />} active={activeTab === 'firewall_rules'} onClick={() => setActiveTab('firewall_rules')} tooltip="Firewall Rules" />
          <SidebarIcon icon={<Target size={20} />} active={activeTab === 'strategy'} onClick={() => setActiveTab('strategy')} tooltip="Strategy" />
          <SidebarIcon icon={<Clock size={20} />} active={activeTab === 'firewall_logs'} onClick={() => setActiveTab('firewall_logs')} tooltip="Security Logs" />
        </div>

        <div className="mt-auto flex flex-col gap-6 items-center">
          <div className="relative group">
            <img 
              src={user.user_metadata?.avatar_url || `https://ui-avatars.com/api/?name=${user.user_metadata?.full_name || 'User'}`} 
              alt="User" 
              className="w-10 h-10 rounded-xl border border-white/10 hover:border-blue-500/50 transition-all cursor-pointer"
            />
            <div className="absolute left-full ml-4 px-3 py-2 bg-slate-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-all whitespace-nowrap z-50 border border-white/5 shadow-2xl">
              <p className="font-bold">{user.user_metadata?.full_name || 'User'}</p>
              <p className="text-slate-400">{user.email}</p>
              <button 
                onClick={handleLogout}
                className="mt-2 w-full py-1 bg-rose-500/20 text-rose-400 rounded border border-rose-500/30 hover:bg-rose-500/30 transition-all pointer-events-auto"
              >
                Logout
              </button>
            </div>
          </div>
          <SidebarIcon icon={<Settings size={20} />} active={false} onClick={() => {}} tooltip="Settings" />
        </div>
      </div>

      <div className="pl-20 flex flex-col min-h-screen">
        {/* Header */}
        <header className="h-16 border-b border-white/10 flex items-center px-8 justify-between glass sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-white">Kaelus <span className="text-blue-400 font-normal">| AI Security Gateway</span></h1>
          </div>
          
          <div className="flex items-center gap-4">
            {state.agents.length > 0 && (
              <button 
                onClick={() => setShowConfigModal(true)}
                className="p-2 hover:bg-white/5 rounded-lg text-slate-400 transition-all"
                title="Customize Agents"
              >
                <Settings2 size={20} />
              </button>
            )}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-white/5 text-xs font-medium text-slate-400">
              <Activity size={14} className={cn(state.status === 'running' && "text-emerald-400 animate-pulse")} />
              {state.status.toUpperCase()}
            </div>
          </div>
        </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Sidebar - Config */}
        <aside className="w-96 border-r border-white/10 p-6 flex flex-col gap-6 overflow-y-auto bg-slate-950/50">
          <section>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 block">Simulation Mode</label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-900 rounded-xl border border-white/5">
              <button 
                onClick={() => {
                  setState(prev => ({ ...prev, mode: 'prediction', agents: [], status: 'idle', logs: [] }));
                  setActiveTab('graph');
                }}
                className={cn(
                  "py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2",
                  state.mode === 'prediction' ? "bg-indigo-600 text-white shadow-lg" : "text-slate-500 hover:text-slate-300"
                )}
              >
                <BrainCircuit size={14} /> Prediction
              </button>
              <button 
                onClick={() => {
                  setState(prev => ({ ...prev, mode: 'development', agents: [], status: 'idle', logs: [] }));
                  setActiveTab('tasks');
                }}
                className={cn(
                  "py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2",
                  state.mode === 'development' ? "bg-emerald-600 text-white shadow-lg" : "text-slate-500 hover:text-slate-300"
                )}
              >
                <Cpu size={14} /> Claw-Code
              </button>
              <button 
                onClick={() => {
                  setState(prev => ({ ...prev, mode: 'firewall', agents: [], status: 'idle', logs: [] }));
                  setActiveTab('firewall_logs');
                  // Fetch initial firewall data
                  fetch('/api/firewall/logs').then(res => res.json()).then(logs => setState(s => ({ ...s, firewallLogs: logs })));
                  fetch('/api/firewall/rules').then(res => res.json()).then(rules => setState(s => ({ ...s, firewallRules: rules })));
                  fetch('/api/firewall/ml-model').then(res => res.json()).then(({ model }) => setState(s => ({ ...s, mlModel: model })));
                }}
                className={cn(
                  "py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2",
                  state.mode === 'firewall' ? "bg-rose-600 text-white shadow-lg" : "text-slate-500 hover:text-slate-300"
                )}
              >
                <ShieldAlert size={14} /> AI Firewall
              </button>
              <button 
                onClick={() => {
                  setState(prev => ({ ...prev, mode: 'strategy', agents: [], status: 'idle', logs: [] }));
                  setActiveTab('audit');
                }}
                className={cn(
                  "py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2",
                  state.mode === 'strategy' ? "bg-indigo-600 text-white shadow-lg" : "text-slate-500 hover:text-slate-300"
                )}
              >
                <Rocket size={14} /> Strategy
              </button>
            </div>
          </section>

          <section>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 block">
              {state.mode === 'prediction' ? 'Source Material' : 'Project Context'}
            </label>
            <div className="relative group">
              <textarea 
                className="w-full h-48 bg-slate-900/50 border border-white/10 rounded-xl p-4 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none outline-none"
                placeholder={state.mode === 'prediction' ? "Paste news articles, reports, or text here..." : "Describe the existing codebase or architecture..."}
                value={config.sourceMaterial}
                onChange={(e) => setConfig({ ...config, sourceMaterial: e.target.value })}
              />
              <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <Upload size={16} className="text-slate-500" />
              </div>
            </div>
          </section>

          <section>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 block">
              {state.mode === 'prediction' ? 'Prediction Goal' : 'Development Goal'}
            </label>
            <input 
              type="text"
              className="w-full bg-slate-900/50 border border-white/10 rounded-xl p-4 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder={state.mode === 'prediction' ? "e.g., How will public opinion shift?" : "e.g., Port this library to Python"}
              value={config.predictionGoal}
              onChange={(e) => setConfig({ ...config, predictionGoal: e.target.value })}
            />
          </section>

          <button 
            onClick={state.agents.length === 0 ? initializeSimulation : runSimulation}
            disabled={state.status === 'running' || state.status === 'initializing' || !config.sourceMaterial}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
          >
            {state.status === 'initializing' || state.status === 'running' ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              <Play size={20} />
            )}
            {state.agents.length === 0 ? 'Initialize Simulation' : 'Run Simulation'}
          </button>

          <div className="mt-auto pt-6 border-t border-white/5">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
              <History size={14} /> Simulation Logs
            </h3>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
              {state.logs.map((log, i) => (
                <div key={i} className="text-[11px] font-mono text-slate-400 border-l border-indigo-500/30 pl-3 py-0.5">
                  {log}
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col bg-slate-900/20 relative">
          {/* Tabs & Filters */}
          <div className="flex p-4 justify-between items-center">
            <div className="flex gap-2">
              {state.mode === 'prediction' ? (
                <>
                  <button 
                    onClick={() => setActiveTab('graph')}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 border transition-all",
                      activeTab === 'graph' 
                        ? "bg-indigo-600/10 text-indigo-400 border-indigo-500/20" 
                        : "hover:bg-white/5 text-slate-400 border-transparent"
                    )}
                  >
                    <Network size={16} /> Relationship Graph
                  </button>
                  <button 
                    onClick={() => setActiveTab('timeline')}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 border transition-all",
                      activeTab === 'timeline' 
                        ? "bg-indigo-600/10 text-indigo-400 border-indigo-500/20" 
                        : "hover:bg-white/5 text-slate-400 border-transparent"
                    )}
                  >
                    <TrendingUp size={16} /> Sentiment Timeline
                  </button>
                  <button 
                    onClick={() => setActiveTab('interactions')}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 border transition-all",
                      activeTab === 'interactions' 
                        ? "bg-indigo-600/10 text-indigo-400 border-indigo-500/20" 
                        : "hover:bg-white/5 text-slate-400 border-transparent"
                    )}
                  >
                    <MessageSquare size={16} /> Interactions
                  </button>
                </>
              ) : state.mode === 'development' ? (
                <>
                  <button 
                    onClick={() => setActiveTab('tasks')}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 border transition-all",
                      activeTab === 'tasks' 
                        ? "bg-emerald-600/10 text-emerald-400 border-emerald-500/20" 
                        : "hover:bg-white/5 text-slate-400 border-transparent"
                    )}
                  >
                    <Layout size={16} /> Task Board
                  </button>
                  <button 
                    onClick={() => setActiveTab('codebase')}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 border transition-all",
                      activeTab === 'codebase' 
                        ? "bg-emerald-600/10 text-emerald-400 border-emerald-500/20" 
                        : "hover:bg-white/5 text-slate-400 border-transparent"
                    )}
                  >
                    <Code2 size={16} /> Module Explorer
                  </button>
                  <button 
                    onClick={() => setActiveTab('interactions')}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 border transition-all",
                      activeTab === 'interactions' 
                        ? "bg-emerald-600/10 text-emerald-400 border-emerald-500/20" 
                        : "hover:bg-white/5 text-slate-400 border-transparent"
                    )}
                  >
                    <Terminal size={16} /> Claw Logs
                  </button>
                </>
              ) : state.mode === 'firewall' ? (
                <>
                  <button 
                    onClick={() => setActiveTab('firewall_logs')}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 border transition-all",
                      activeTab === 'firewall_logs' 
                        ? "bg-rose-600/10 text-rose-400 border-rose-500/20" 
                        : "hover:bg-white/5 text-slate-400 border-transparent"
                    )}
                  >
                    <ShieldAlert size={16} /> Blocked Attempts
                  </button>
                  <button 
                    onClick={() => setActiveTab('firewall_rules')}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 border transition-all",
                      activeTab === 'firewall_rules' 
                        ? "bg-rose-600/10 text-rose-400 border-rose-500/20" 
                        : "hover:bg-white/5 text-slate-400 border-transparent"
                    )}
                  >
                    <Settings2 size={16} /> Firewall Rules
                  </button>
                  <button 
                    onClick={() => setActiveTab('firewall_dashboard')}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 border transition-all",
                      activeTab === 'firewall_dashboard' 
                        ? "bg-rose-600/10 text-rose-400 border-rose-500/20" 
                        : "hover:bg-white/5 text-slate-400 border-transparent"
                    )}
                  >
                    <LayoutDashboard size={16} /> Security Dashboard
                  </button>
                </>
              ) : state.mode === 'strategy' ? (
                <>
                  <button 
                    onClick={() => setActiveTab('audit')}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 border transition-all",
                      activeTab === 'audit' 
                        ? "bg-indigo-600/10 text-indigo-400 border-indigo-500/20" 
                        : "hover:bg-white/5 text-slate-400 border-transparent"
                    )}
                  >
                    <BarChart3 size={16} /> 360° Audit
                  </button>
                  <button 
                    onClick={() => setActiveTab('prd')}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 border transition-all",
                      activeTab === 'prd' 
                        ? "bg-indigo-600/10 text-indigo-400 border-indigo-500/20" 
                        : "hover:bg-white/5 text-slate-400 border-transparent"
                    )}
                  >
                    <FileText size={16} /> PRD
                  </button>
                  <button 
                    onClick={() => setActiveTab('roadmap')}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 border transition-all",
                      activeTab === 'roadmap' 
                        ? "bg-indigo-600/10 text-indigo-400 border-indigo-500/20" 
                        : "hover:bg-white/5 text-slate-400 border-transparent"
                    )}
                  >
                    <History size={16} /> 7-Day Roadmap
                  </button>
                </>
              ) : null}
              {state.report && (
                <button 
                  onClick={() => setShowReport(true)}
                  className="px-4 py-2 rounded-lg hover:bg-white/5 text-slate-400 text-sm font-medium flex items-center gap-2 transition-all"
                >
                  <FileText size={16} /> {state.mode === 'prediction' ? 'Prediction Report' : 'Development Summary'}
                </button>
              )}
            </div>

            {activeTab === 'graph' && state.agents.length > 0 && (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 glass px-3 py-1.5 rounded-xl border border-white/10">
                  <Filter size={14} className="text-slate-500" />
                  <select 
                    className="bg-transparent text-xs font-medium text-slate-300 outline-none cursor-pointer"
                    value={filterGroup}
                    onChange={(e) => setFilterGroup(e.target.value)}
                  >
                    <option value="">All Groups</option>
                    {groups.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-3 glass px-3 py-1.5 rounded-xl border border-white/10">
                  <Activity size={14} className="text-slate-500" />
                  <select 
                    className="bg-transparent text-xs font-medium text-slate-300 outline-none cursor-pointer"
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                  >
                    <option value="">All Statuses</option>
                    <option value="idle">Idle</option>
                    <option value="interacting">Interacting</option>
                    <option value="thinking">Thinking</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Visualization Area */}
          <div className="flex-1 p-4 pt-0 relative overflow-hidden">
            {state.mode === 'strategy' ? (
              <div className="h-full w-full">
                {activeTab === 'audit' && (
                  <div className="h-full overflow-y-auto pr-4 custom-scrollbar">
                    <div className="max-w-4xl mx-auto py-8">
                      <div className="flex items-center gap-4 mb-8">
                        <div className="p-3 rounded-2xl bg-indigo-600/20 text-indigo-400">
                          <BarChart3 size={32} />
                        </div>
                        <div>
                          <h2 className="text-3xl font-bold text-white">360° Kaelus Audit</h2>
                          <p className="text-slate-400">Strategic analysis for YC-readiness and US market entry.</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        <div className="glass p-6 rounded-2xl border border-white/10">
                          <div className="flex items-center gap-3 mb-4 text-emerald-400">
                            <Zap size={20} />
                            <h3 className="font-bold">Technical Verdict</h3>
                          </div>
                          <p className="text-sm text-slate-400 leading-relaxed">
                            The core scanning engine is fast but currently lacks depth. The transition from regex to ML-based intent detection is critical for enterprise defensibility.
                          </p>
                        </div>
                        <div className="glass p-6 rounded-2xl border border-white/10">
                          <div className="flex items-center gap-3 mb-4 text-indigo-400">
                            <Target size={20} />
                            <h3 className="font-bold">Market Fit</h3>
                          </div>
                          <p className="text-sm text-slate-400 leading-relaxed">
                            High demand in Fintech and Healthcare. The "Zero Behavior Change" hook is your strongest wedge against heavy incumbents like Nightfall.
                          </p>
                        </div>
                      </div>

                      <div className="space-y-8">
                        <section>
                          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <AlertCircle size={18} className="text-rose-400" /> Critical Blockers
                          </h3>
                          <div className="space-y-4">
                            {[
                              { title: 'Mocked Infrastructure', details: 'The gateway does not currently proxy real traffic. This is a "toy" until it handles live OpenAI/Anthropic streams.' },
                              { title: 'Lack of Persistence', details: 'No database integration means audit trails are lost on refresh. Compliance requires permanent, tamper-proof logs.' },
                              { title: 'Identity Crisis', details: 'The product mixes simulation and security. Investors need a focused "Security Gateway" pitch.' }
                            ].map((b, i) => (
                              <div key={i} className="glass p-4 rounded-xl border-l-4 border-rose-500/50 bg-rose-500/5">
                                <h4 className="text-sm font-bold text-white mb-1">{b.title}</h4>
                                <p className="text-xs text-slate-400">{b.details}</p>
                              </div>
                            ))}
                          </div>
                        </section>

                        <section>
                          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <CheckCircle2 size={18} className="text-emerald-400" /> YC-Readiness Score: 6.5/10
                          </h3>
                          <div className="glass p-6 rounded-2xl border border-white/10 space-y-4">
                            <p className="text-sm text-slate-400 italic">
                              "Kaelus has a strong 'Why Now' (AI regulation boom) and a clear technical wedge. To hit 9/10, you need to prove sub-10ms latency on real ML-based scanning."
                            </p>
                            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/5">
                              <div className="text-center">
                                <div className="text-xl font-bold text-white">10x</div>
                                <div className="text-[10px] text-slate-500 uppercase">Better Speed</div>
                              </div>
                              <div className="text-center border-x border-white/5">
                                <div className="text-xl font-bold text-white">0</div>
                                <div className="text-[10px] text-slate-500 uppercase">Friction</div>
                              </div>
                              <div className="text-center">
                                <div className="text-xl font-bold text-white">100%</div>
                                <div className="text-[10px] text-slate-500 uppercase">Audit Ready</div>
                              </div>
                            </div>
                          </div>
                        </section>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'prd' && (
                  <div className="h-full overflow-y-auto pr-4 custom-scrollbar">
                    <div className="max-w-4xl mx-auto py-8">
                      <div className="flex items-center gap-4 mb-8">
                        <div className="p-3 rounded-2xl bg-indigo-600/20 text-indigo-400">
                          <FileText size={32} />
                        </div>
                        <div>
                          <h2 className="text-3xl font-bold text-white">Product Requirements Document</h2>
                          <p className="text-slate-400">Kaelus v1.0: The Compliance-First AI Gateway.</p>
                        </div>
                      </div>

                      <div className="space-y-8">
                        <div className="glass p-8 rounded-3xl border border-white/10">
                          <h3 className="text-xl font-bold text-white mb-6">1. Executive Summary</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div>
                              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Target Customer</h4>
                              <p className="text-sm text-slate-300">Mid-market Fintech & Healthcare CTOs who are currently blocking ChatGPT/Claude due to HIPAA/SOC 2 fears.</p>
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Value Proposition</h4>
                              <p className="text-sm text-slate-300">"Enable AI for your team in 60 seconds without leaking a single byte of PII or trade secrets."</p>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          {[
                            { title: 'Real-Time Interception', desc: 'Proxy all /v1/chat/completions traffic with <10ms overhead.' },
                            { title: 'Smart PII Masking', desc: 'Automatically redact or block SSNs, emails, and medical data.' },
                            { title: 'Tamper-Proof Logs', desc: 'Immutable audit trails for SOC 2 and HIPAA compliance.' }
                          ].map((f, i) => (
                            <div key={i} className="glass p-6 rounded-2xl border border-white/10">
                              <h4 className="font-bold text-white mb-2">{f.title}</h4>
                              <p className="text-xs text-slate-400 leading-relaxed">{f.desc}</p>
                            </div>
                          ))}
                        </div>

                        <div className="glass p-8 rounded-3xl border border-white/10">
                          <h3 className="text-xl font-bold text-white mb-6">2. Success Metrics (KPIs)</h3>
                          <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
                              <span className="text-sm text-slate-300">Average Scanning Latency</span>
                              <span className="text-sm font-bold text-emerald-400">&lt; 10ms</span>
                            </div>
                            <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
                              <span className="text-sm text-slate-300">PII Detection Accuracy</span>
                              <span className="text-sm font-bold text-indigo-400">&gt; 99.9%</span>
                            </div>
                            <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
                              <span className="text-sm text-slate-300">Integration Time</span>
                              <span className="text-sm font-bold text-amber-400">&lt; 2 mins</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'roadmap' && (
                  <div className="h-full overflow-y-auto pr-4 custom-scrollbar">
                    <div className="max-w-4xl mx-auto py-8">
                      <div className="flex items-center gap-4 mb-8">
                        <div className="p-3 rounded-2xl bg-indigo-600/20 text-indigo-400">
                          <History size={32} />
                        </div>
                        <div>
                          <h2 className="text-3xl font-bold text-white">7-Day Execution Roadmap</h2>
                          <p className="text-slate-400">The sprint to fundability and initial US traction.</p>
                        </div>
                      </div>

                      <div className="space-y-6">
                        {[
                          { day: 1, title: 'Rebranding & Identity', tasks: ['Rebrand UI to Kaelus', 'Define core value prop: "Zero-Latency Compliance"', 'Update landing page messaging'], status: 'completed' },
                          { day: 2, title: 'Real Proxy Implementation', tasks: ['Replace mock gateway with real OpenAI/Anthropic proxy', 'Implement streaming support', 'Add basic auth for gateway access'], status: 'in-progress' },
                          { day: 3, title: 'Persistence & Audit Trails', tasks: ['Integrate Firestore for log storage', 'Implement tamper-proof hashing for logs', 'Add export to CSV/JSON for compliance audits'], status: 'pending' },
                          { day: 4, title: 'Compliance Rule Packs', tasks: ['Build HIPAA-specific regex/ML patterns', 'Add SOC 2 "Least Privilege" rule templates', 'Implement custom rule builder UI'], status: 'completed' },
                          { day: 5, title: 'Smart Scanning (ML)', tasks: ['Integrate Gemini Flash for intent-based scanning', 'Implement "Code Leak" detection for proprietary repos', 'Optimize for <10ms overhead'], status: 'completed' },
                          { day: 6, title: 'Onboarding & SDK Integration', tasks: ['Build "1-Line Integration" guide in dashboard', 'Create example repos for Python/Node SDKs', 'Add dashboard analytics (blocked vs allowed)'], status: 'pending' },
                          { day: 7, title: 'Launch & Outreach', tasks: ['Deploy to production URL', 'Submit to YC / Product Hunt', 'Start direct outreach to mid-market CSOs'], status: 'pending' }
                        ].map((item) => (
                          <div key={item.day} className="glass p-6 rounded-2xl border border-white/10 relative overflow-hidden group">
                            <div className="flex items-start gap-6">
                              <div className={cn(
                                "w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg shrink-0",
                                item.status === 'completed' ? "bg-emerald-500/20 text-emerald-400" :
                                item.status === 'in-progress' ? "bg-indigo-500/20 text-indigo-400 animate-pulse" :
                                "bg-slate-800 text-slate-500"
                              )}>
                                D{item.day}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center justify-between mb-4">
                                  <h3 className="text-xl font-bold text-white">{item.title}</h3>
                                  <span className={cn(
                                    "text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider",
                                    item.status === 'completed' ? "bg-emerald-500/20 text-emerald-400" :
                                    item.status === 'in-progress' ? "bg-indigo-500/20 text-indigo-400" :
                                    "bg-slate-800 text-slate-500"
                                  )}>
                                    {item.status}
                                  </span>
                                </div>
                                <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  {item.tasks.map((task, idx) => (
                                    <li key={idx} className="flex items-center gap-3 text-sm text-slate-400">
                                      <div className={cn(
                                        "w-1.5 h-1.5 rounded-full",
                                        item.status === 'completed' ? "bg-emerald-500" : "bg-slate-700"
                                      )} />
                                      {task}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : state.agents.length > 0 ? (
              activeTab === 'graph' ? (
                <div className="w-full h-full flex flex-col gap-4">
                  <div className="flex items-center justify-between px-4 py-2 bg-slate-900/50 border border-white/5 rounded-xl">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Filter size={14} className="text-slate-500" />
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Filters:</span>
                      </div>
                      <select 
                        value={filterStatus} 
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="bg-slate-950 border border-white/10 rounded-lg px-2 py-1 text-[10px] text-slate-300 outline-none focus:border-indigo-500"
                      >
                        <option value="">All Statuses</option>
                        <option value="idle">Idle</option>
                        <option value="interacting">Interacting</option>
                        <option value="thinking">Thinking</option>
                      </select>
                      <select 
                        value={filterGroup} 
                        onChange={(e) => setFilterGroup(e.target.value)}
                        className="bg-slate-950 border border-white/10 rounded-lg px-2 py-1 text-[10px] text-slate-300 outline-none focus:border-indigo-500"
                      >
                        <option value="">All Groups</option>
                        {groups.map(group => (
                          <option key={group} value={group}>{group}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                        <span className="text-[10px] text-slate-400">Positive</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
                        <span className="text-[10px] text-slate-400">Negative</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0">
                    <SimulationGraph 
                      agents={state.agents} 
                      relationships={state.relationships} 
                      interactions={state.interactions}
                      onAgentClick={(agent) => {
                        setSelectedAgent(agent);
                        setChatHistory([]);
                      }}
                      filterGroup={filterGroup}
                      filterStatus={filterStatus}
                      highlightedAgentId={selectedAgent?.id}
                    />
                  </div>
                </div>
              ) : activeTab === 'timeline' ? (
                <SentimentTimeline agents={state.agents} />
              ) : activeTab === 'tasks' ? (
                <div className="w-full h-full bg-slate-950/50 rounded-xl p-6 overflow-y-auto custom-scrollbar">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-6">Autonomous Task Queue</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {state.tasks.map(task => (
                      <div key={task.id} className="p-4 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-3">
                        <div className="flex justify-between items-start">
                          <h4 className="font-bold text-white text-sm">{task.title}</h4>
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                            task.status === 'completed' ? "bg-emerald-500/20 text-emerald-400" :
                            task.status === 'in-progress' ? "bg-amber-500/20 text-amber-400 animate-pulse" :
                            "bg-slate-800 text-slate-500"
                          )}>
                            {task.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">{task.description}</p>
                        {task.assignedTo && (
                          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/5">
                            <div className="w-5 h-5 rounded bg-emerald-600/20 flex items-center justify-center text-[10px] font-bold text-emerald-400">
                              {state.agents.find(a => a.id === task.assignedTo)?.name.charAt(0)}
                            </div>
                            <span className="text-[10px] text-slate-500">Assigned to {state.agents.find(a => a.id === task.assignedTo)?.name}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : activeTab === 'codebase' ? (
                <div className="w-full h-full bg-slate-950/50 rounded-xl p-6 overflow-y-auto custom-scrollbar">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-6">Generated Modules</h3>
                  <div className="space-y-4">
                    {state.modules.length === 0 ? (
                      <p className="text-sm text-slate-500 italic">No modules built yet.</p>
                    ) : (
                      state.modules.map(mod => (
                        <div key={mod.id} className="p-4 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-4">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <Code2 size={16} className="text-emerald-400" />
                              <span className="font-mono text-sm text-white">{mod.path}</span>
                            </div>
                            <div className="flex gap-2">
                              {mod.tests.map((test, i) => (
                                <div key={i} title={test.name}>
                                  {test.status === 'passed' ? <CheckCircle2 size={14} className="text-emerald-500" /> : <AlertCircle size={14} className="text-red-500" />}
                                </div>
                              ))}
                            </div>
                          </div>
                          <pre className="bg-slate-950 p-4 rounded-lg text-[10px] font-mono text-emerald-500/80 overflow-x-auto border border-white/5">
                            {mod.content}
                          </pre>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : activeTab === 'firewall_logs' ? (
                <div className="w-full h-full bg-slate-950/50 rounded-xl p-6 overflow-y-auto custom-scrollbar">
                  <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-rose-600/20 text-rose-400">
                        <ShieldAlert size={20} />
                      </div>
                      <h3 className="text-lg font-bold text-white">Security Violation Logs</h3>
                    </div>
                    <div className="flex items-center gap-4">
                      <button onClick={() => exportLogs('csv')} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded-lg transition-colors border border-white/10">
                        Export CSV
                      </button>
                      <button onClick={() => exportLogs('json')} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded-lg transition-colors border border-white/10">
                        Export JSON
                      </button>
                      <div className="flex items-center gap-2 px-3 py-1 bg-rose-500/10 border border-rose-500/20 rounded-full">
                        <ShieldAlert size={12} className="text-rose-400" />
                        <span className="text-[10px] font-bold text-rose-400">{state.firewallLogs.filter(l => l.blocked).length} BLOCKED</span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                        <ShieldCheck size={12} className="text-emerald-400" />
                        <span className="text-[10px] font-bold text-emerald-400">{state.firewallLogs.filter(l => !l.blocked).length} ALLOWED</span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {state.firewallLogs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 text-slate-600 gap-4">
                        <ShieldCheck size={48} strokeWidth={1} />
                        <p className="text-sm">No security violations detected. Your AI traffic is clean.</p>
                      </div>
                    ) : (
                      state.firewallLogs.map(log => (
                        <div key={log.id} className={cn(
                          "p-4 rounded-xl border transition-all flex flex-col gap-3 group",
                          log.blocked 
                            ? "bg-rose-500/5 border-rose-500/20 hover:border-rose-500/40" 
                            : "bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40"
                        )}>
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] font-mono text-slate-500">{new Date(log.timestamp).toLocaleString()}</span>
                              <div className="flex gap-1">
                                {log.violations.length > 0 ? (
                                  log.violations.map((v: string) => (
                                    <span key={v} className="px-2 py-0.5 bg-rose-500/20 text-rose-400 text-[9px] font-bold rounded uppercase">{v}</span>
                                  ))
                                ) : (
                                  <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[9px] font-bold rounded uppercase">CLEAN</span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] font-mono text-slate-600">{log.latency}ms latency</span>
                              <span className="text-[10px] font-mono text-slate-600 uppercase">{log.model}</span>
                            </div>
                          </div>
                          <div className="bg-slate-950/50 p-3 rounded-lg border border-white/5">
                            <p className="text-xs font-mono text-slate-400 break-all">{log.promptSnippet}</p>
                          </div>
                          {log.hash && (
                            <div className="flex items-center gap-2">
                              <ShieldCheck size={10} className="text-emerald-500/50" />
                              <span className="text-[9px] font-mono text-slate-600">SHA-256: {log.hash}</span>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : activeTab === 'firewall_rules' ? (
                <div className="w-full h-full bg-slate-950/50 rounded-xl p-6 overflow-y-auto custom-scrollbar">
                  <div className="flex justify-between items-center mb-8">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-rose-600/20 text-rose-400">
                        <Settings2 size={20} />
                      </div>
                      <h3 className="text-lg font-bold text-white">Firewall Rule Management</h3>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-xl mr-4">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Compliance Packs:</span>
                        <button 
                          onClick={() => applyComplianceTemplate('hipaa')}
                          className="px-3 py-1 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-[10px] font-bold transition-all border border-emerald-500/20"
                        >
                          HIPAA
                        </button>
                        <button 
                          onClick={() => applyComplianceTemplate('soc2')}
                          className="px-3 py-1 hover:bg-indigo-500/20 text-indigo-400 rounded-lg text-[10px] font-bold transition-all border border-indigo-500/20"
                        >
                          SOC 2
                        </button>
                      </div>
                      <button 
                        onClick={() => {
                          setRuleForm({ name: '', pattern: '', type: 'regex', action: 'block', enabled: true, description: '' });
                          setEditingRuleId(null);
                          setRegexTestString('');
                          setShowTestInput(false);
                          setIsAddingRule(true);
                        }}
                        className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-rose-600/20"
                      >
                        <PlusCircle size={16} /> Add Custom Rule
                      </button>
                    </div>
                  </div>

                  <div className="mb-8 p-5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-white text-sm mb-1">Intent-Based Detection Model</h4>
                      <p className="text-xs text-slate-400">Select the ML model used for deep intent scanning when regex rules don't match.</p>
                    </div>
                    <div>
                      <select
                        className="bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-rose-500"
                        value={state.mlModel}
                        onChange={async (e) => {
                          const newModel = e.target.value;
                          setState(prev => ({ ...prev, mlModel: newModel }));
                          try {
                            await fetch('/api/firewall/ml-model', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ model: newModel })
                            });
                          } catch (err) {
                            console.error("Failed to update ML model", err);
                          }
                        }}
                      >
                        <option value="gemini-3-flash-preview">Gemini 3 Flash Preview</option>
                        <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro Preview</option>
                        <option value="claude-3-opus-20240229">Anthropic Claude 3 Opus</option>
                        <option value="claude-3-sonnet-20240229">Anthropic Claude 3 Sonnet</option>
                        <option value="claude-3-haiku-20240307">Anthropic Claude 3 Haiku</option>
                        <option value="gpt-4-turbo">OpenAI GPT-4 Turbo</option>
                        <option value="gpt-3.5-turbo">OpenAI GPT-3.5 Turbo</option>
                        <option value="future-model-placeholder">Future Model Placeholder</option>
                      </select>
                    </div>
                  </div>

                  {isAddingRule && (
                    <div className="mb-8 glass p-6 rounded-2xl border border-rose-500/30 bg-rose-500/5 animate-in fade-in slide-in-from-top-4">
                      <div className="flex justify-between items-center mb-6">
                        <h4 className="font-bold text-white">{editingRuleId ? 'Edit Security Rule' : 'New Security Rule'}</h4>
                        <button onClick={() => {
                          setIsAddingRule(false);
                          setEditingRuleId(null);
                          setRegexTestString('');
                          setShowTestInput(false);
                        }} className="p-1 hover:bg-white/10 rounded-full transition-all">
                          <X size={16} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Rule Name</label>
                            <input 
                              className="w-full bg-slate-950/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-rose-500"
                              placeholder="e.g., Block AWS Keys"
                              value={ruleForm.name}
                              onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Sensitive Data Type</label>
                            <select
                              className="w-full bg-slate-950/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-rose-500 appearance-none"
                              onChange={(e) => {
                                const selected = PREDEFINED_PATTERNS.find(p => p.id === e.target.value);
                                if (selected) {
                                  if (selected.id === 'custom') {
                                    setRuleForm({ ...ruleForm, type: 'regex' });
                                  } else {
                                    setRuleForm({ 
                                      ...ruleForm, 
                                      pattern: selected.pattern, 
                                      type: selected.type,
                                      name: ruleForm.name || selected.label
                                    });
                                  }
                                }
                              }}
                              value={PREDEFINED_PATTERNS.find(p => p.pattern === ruleForm.pattern)?.id || 'custom'}
                            >
                              {PREDEFINED_PATTERNS.map(p => (
                                <option key={p.id} value={p.id} className="bg-slate-900">{p.label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <div className="flex justify-between items-center mb-2">
                              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Regex Pattern</label>
                              {ruleForm.pattern && (
                                <span className={cn("text-[10px] font-bold uppercase tracking-widest", isRegexValid ? "text-emerald-400" : "text-rose-400")}>
                                  {isRegexValid ? "Valid Regex" : "Invalid Regex"}
                                </span>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <div className="relative flex-1">
                                <input 
                                  className={cn(
                                    "w-full bg-slate-950/50 border rounded-lg px-3 py-2 text-sm font-mono outline-none transition-all pr-8",
                                    !ruleForm.pattern ? "border-white/10 text-indigo-400 focus:border-rose-500" :
                                    isRegexValid ? "border-emerald-500/30 text-emerald-400 focus:border-emerald-500" : "border-rose-500/50 text-rose-400 focus:border-rose-500"
                                  )}
                                  placeholder="e.g., AKIA[0-9A-Z]{16}"
                                  value={ruleForm.pattern}
                                  onChange={(e) => setRuleForm({ ...ruleForm, pattern: e.target.value })}
                                />
                                {ruleForm.pattern && (
                                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                    {isRegexValid ? (
                                      <CheckCircle2 size={16} className="text-emerald-500" />
                                    ) : (
                                      <AlertCircle size={16} className="text-rose-500" />
                                    )}
                                  </div>
                                )}
                              </div>
                              <button
                                onClick={() => setShowTestInput(!showTestInput)}
                                className={cn(
                                  "px-3 py-2 rounded-lg text-xs font-bold transition-all border whitespace-nowrap flex items-center gap-1.5",
                                  showTestInput 
                                    ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/30" 
                                    : "bg-white/5 text-slate-400 border-white/10 hover:bg-white/10"
                                )}
                              >
                                <Terminal size={14} />
                                Test Pattern
                              </button>
                            </div>
                            {!isRegexValid && regexError && (
                              <p className="text-xs text-rose-400 mt-1.5 flex items-center gap-1">
                                <AlertCircle size={12} />
                                {regexError}
                              </p>
                            )}
                          </div>
                          {showTestInput && (
                            <div className="animate-in fade-in slide-in-from-top-2">
                              <div className="flex justify-between items-center mb-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Test String</label>
                                {ruleForm.pattern && isRegexValid && regexTestString && (
                                  <span className={cn("text-[10px] font-bold uppercase tracking-widest", isMatch ? "text-rose-400" : "text-emerald-400")}>
                                    {isMatch ? "Matches (Blocked)" : "No Match (Allowed)"}
                                  </span>
                                )}
                              </div>
                              <input 
                                className={cn(
                                  "w-full bg-slate-950/50 border rounded-lg px-3 py-2 text-sm text-white outline-none transition-all",
                                  !regexTestString || !isRegexValid || !ruleForm.pattern ? "border-white/10 focus:border-rose-500" :
                                  isMatch ? "border-rose-500/50 focus:border-rose-500" : "border-emerald-500/30 focus:border-emerald-500"
                                )}
                                placeholder="Enter a string to test against the regex..."
                                value={regexTestString}
                                onChange={(e) => setRegexTestString(e.target.value)}
                              />
                            </div>
                          )}
                        </div>
                        <div className="space-y-4">
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Action</label>
                            <select
                              className="w-full bg-slate-950/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-rose-500 appearance-none"
                              value={ruleForm.action}
                              onChange={(e) => setRuleForm({ ...ruleForm, action: e.target.value as any })}
                            >
                              <option value="block" className="bg-slate-900">Block</option>
                              <option value="alert" className="bg-slate-900">Alert</option>
                              <option value="mask" className="bg-slate-900">Mask</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Description</label>
                            <textarea 
                              className="w-full bg-slate-950/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-rose-500 h-20 resize-none"
                              placeholder="Describe what this rule protects..."
                              value={ruleForm.description}
                              onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value })}
                            />
                          </div>
                          <div className="flex gap-4">
                            <button 
                              onClick={addFirewallRule}
                              disabled={!isRegexValid || !ruleForm.pattern}
                              className={cn(
                                "flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all",
                                isRegexValid && ruleForm.pattern ? "bg-rose-600 hover:bg-rose-500 text-white" : "bg-slate-800 text-slate-500 cursor-not-allowed"
                              )}
                            >
                              <Save size={16} /> Save Rule
                            </button>
                            <button 
                              onClick={() => {
                                setIsAddingRule(false);
                                setEditingRuleId(null);
                                setRegexTestString('');
                                setShowTestInput(false);
                              }}
                              className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-slate-400 rounded-lg text-sm font-bold transition-all"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {state.firewallRules.map(rule => (
                      <div key={rule.id} className="p-5 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-4 group hover:border-rose-500/30 transition-all">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "p-2 rounded-lg transition-all",
                              rule.enabled ? "bg-rose-600/20 text-rose-400" : "bg-slate-800 text-slate-500"
                            )}>
                              <Lock size={16} />
                            </div>
                            <div>
                              <h4 className="font-bold text-white text-sm">{rule.name}</h4>
                              <p className="text-[10px] text-slate-500 uppercase tracking-wider">{rule.type}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => {
                                setRuleForm({
                                  name: rule.name,
                                  pattern: rule.pattern,
                                  type: rule.type,
                                  action: rule.action,
                                  enabled: rule.enabled,
                                  description: rule.description
                                });
                                setEditingRuleId(rule.id);
                                setIsAddingRule(true);
                              }}
                              className="p-2 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                              title="Edit Rule"
                            >
                              <Settings2 size={14} />
                            </button>
                            <button 
                              onClick={() => updateFirewallRule(rule.id, { enabled: !rule.enabled })}
                              className={cn(
                                "p-2 rounded-lg transition-all",
                                rule.enabled ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20" : "bg-slate-800 text-slate-500 hover:bg-slate-700"
                              )}
                              title={rule.enabled ? "Disable Rule" : "Enable Rule"}
                            >
                              <Power size={14} />
                            </button>
                            <button 
                              onClick={() => deleteFirewallRule(rule.id)}
                              className="p-2 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                              title="Delete Rule"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <p className="text-xs text-slate-400 leading-relaxed">{rule.description}</p>
                          <div className="p-2 bg-slate-950/50 rounded-lg border border-white/5">
                            <code className="text-[10px] text-indigo-400 font-mono break-all">{rule.pattern}</code>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : activeTab === 'firewall_dashboard' ? (
                <div className="w-full h-full bg-slate-950/50 rounded-xl p-6 overflow-y-auto custom-scrollbar">
                  <div className="flex justify-between items-center mb-8">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400">
                        <LayoutDashboard size={20} />
                      </div>
                      <h3 className="text-lg font-bold text-white">Security Intelligence Dashboard</h3>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-xl border border-white/10">
                        <Clock size={14} className="text-slate-500" />
                        <span className="text-xs text-slate-400">Real-time Monitoring Active</span>
                      </div>
                      <button 
                        onClick={async () => {
                          const newState = !state.isRealProxyEnabled;
                          await fetch('/api/firewall/toggle-proxy', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ enabled: newState })
                          });
                          setState(prev => ({ ...prev, isRealProxyEnabled: newState }));
                        }}
                        className={cn(
                          "px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all border",
                          state.isRealProxyEnabled 
                            ? "bg-emerald-600/10 text-emerald-400 border-emerald-500/20" 
                            : "bg-rose-600/10 text-rose-400 border-rose-500/20"
                        )}
                      >
                        <Cpu size={14} />
                        {state.isRealProxyEnabled ? "Real Proxy: ON" : "Real Proxy: OFF"}
                      </button>
                    </div>
                  </div>

                  {/* Security Status Overview */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                    <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[
                        { label: 'Total Scanned', value: state.firewallLogs.length, icon: Eye, color: 'text-indigo-400', trend: '+12%' },
                        { label: 'Blocked Threats', value: state.firewallLogs.filter(l => l.blocked).length, icon: ShieldAlert, color: 'text-rose-400', trend: '-5%' },
                        { label: 'Avg Latency', value: `${Math.round(state.firewallLogs.reduce((acc, l) => acc + l.latency, 0) / (state.firewallLogs.length || 1))}ms`, icon: Zap, color: 'text-amber-400', trend: '-2ms' },
                        { label: 'Active Rules', value: state.firewallRules.filter(r => r.enabled).length, icon: Lock, color: 'text-emerald-400', trend: 'Stable' }
                      ].map((stat, i) => (
                        <div key={i} className="glass p-6 rounded-2xl border border-white/10 flex flex-col gap-2 hover:border-white/20 transition-all">
                          <div className="flex justify-between items-center">
                            <stat.icon size={18} className={stat.color} />
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{stat.trend}</span>
                          </div>
                          <div className="text-2xl font-bold text-white mt-2">{stat.value}</div>
                          <div className="text-xs text-slate-500">{stat.label}</div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="glass p-6 rounded-2xl border border-white/10 flex flex-col items-center justify-center text-center relative overflow-hidden">
                      <div className="absolute inset-0 bg-blue-500/5" />
                      <div className={cn(
                        "w-24 h-24 rounded-full flex items-center justify-center border-4 mb-4 z-10",
                        state.firewallLogs.filter(l => l.blocked).length > 10 ? "border-rose-500/30 text-rose-400" : "border-emerald-500/30 text-emerald-400"
                      )}>
                        <ShieldCheck size={40} />
                      </div>
                      <h4 className="text-lg font-bold text-white z-10">
                        {state.firewallLogs.filter(l => l.blocked).length > 10 ? "Action Required" : "System Secure"}
                      </h4>
                      <p className="text-xs text-slate-400 mt-2 z-10">
                        {state.firewallLogs.filter(l => l.blocked).length > 10 
                          ? "Multiple security violations detected in the last hour." 
                          : "All AI traffic is currently being scanned and filtered."}
                      </p>
                      <button 
                        onClick={() => setActiveTab('firewall_logs')}
                        className="mt-6 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold text-white transition-all z-10"
                      >
                        View Full Audit
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    <div className="glass p-6 rounded-2xl border border-white/10 h-80 flex flex-col">
                      <h4 className="text-sm font-bold text-white mb-6 flex items-center gap-2">
                        <Activity size={16} className="text-indigo-400" /> Latency Over Time (ms)
                      </h4>
                      <div className="flex-1">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={state.firewallLogs.slice(0, 20).reverse()}>
                            <defs>
                              <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                            <XAxis dataKey="timestamp" hide />
                            <YAxis stroke="#475569" fontSize={10} />
                            <RechartsTooltip 
                              contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                              itemStyle={{ color: '#818cf8' }}
                            />
                            <Area type="monotone" dataKey="latency" stroke="#818cf8" fillOpacity={1} fill="url(#colorLatency)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="glass p-6 rounded-2xl border border-white/10 h-80 flex flex-col">
                      <h4 className="text-sm font-bold text-white mb-6 flex items-center gap-2">
                        <AlertTriangle size={16} className="text-rose-400" /> Violation Distribution
                      </h4>
                      <div className="flex-1">
                        <ResponsiveContainer width="100%" height="100%">
                          <RechartsBarChart data={Object.entries(
                            state.firewallLogs.reduce((acc: any, log) => {
                              log.violations.forEach((v: string) => acc[v] = (acc[v] || 0) + 1);
                              return acc;
                            }, {})
                          ).map(([name, value]) => ({ name, value }))}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                            <XAxis dataKey="name" stroke="#475569" fontSize={10} />
                            <YAxis stroke="#475569" fontSize={10} />
                            <RechartsTooltip 
                              contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                            />
                            <Bar dataKey="value" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                          </RechartsBarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 glass p-6 rounded-2xl border border-white/10">
                      <h4 className="text-sm font-bold text-white mb-6 flex items-center gap-2">
                        <ShieldAlert size={16} className="text-rose-400" /> Recent Security Violations
                      </h4>
                      <div className="space-y-4">
                        {state.firewallLogs.filter(l => l.blocked).slice(0, 5).map(log => (
                          <div key={log.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                            <div className="flex items-center gap-4">
                              <div className="w-8 h-8 rounded-lg bg-rose-500/20 flex items-center justify-center text-rose-400">
                                <AlertCircle size={16} />
                              </div>
                              <div>
                                <div className="flex gap-1 mb-1">
                                  {log.violations.map((v: string) => (
                                    <span key={v} className="text-[8px] font-bold bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded uppercase">{v}</span>
                                  ))}
                                </div>
                                <p className="text-[10px] text-slate-400 font-mono truncate max-w-[200px] md:max-w-[400px]">
                                  {log.promptSnippet}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] text-white font-bold">{log.latency}ms</p>
                              <p className="text-[8px] text-slate-500 uppercase">{new Date(log.timestamp).toLocaleTimeString()}</p>
                            </div>
                          </div>
                        ))}
                        {state.firewallLogs.filter(l => l.blocked).length === 0 && (
                          <p className="text-xs text-slate-500 italic text-center py-8">No recent violations detected.</p>
                        )}
                      </div>
                    </div>

                    <div className="glass p-6 rounded-2xl border border-white/10">
                      <h4 className="text-sm font-bold text-white mb-6 flex items-center gap-2">
                        <PieChart size={16} className="text-emerald-400" /> Traffic Composition
                      </h4>
                      <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <RechartsPieChart>
                            <Pie
                              data={[
                                { name: 'Blocked', value: state.firewallLogs.filter(l => l.blocked).length },
                                { name: 'Allowed', value: state.firewallLogs.filter(l => !l.blocked).length }
                              ]}
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                            >
                              <Cell fill="#f43f5e" />
                              <Cell fill="#10b981" />
                            </Pie>
                            <RechartsTooltip 
                              contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                            />
                          </RechartsPieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex justify-center gap-6 mt-4">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-rose-500" />
                          <span className="text-[10px] text-slate-400">Blocked</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span className="text-[10px] text-slate-400">Allowed</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-full h-full bg-slate-950/50 rounded-xl p-6 overflow-y-auto custom-scrollbar">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-6">
                    {state.mode === 'prediction' ? 'Detailed Agent Interactions' : 'Claw Execution Logs'}
                  </h3>
                  <div className="space-y-4">
                    {state.interactions.length === 0 && state.mode === 'prediction' ? (
                      <p className="text-sm text-slate-500 italic">No interactions recorded yet.</p>
                    ) : state.mode === 'prediction' ? (
                      state.interactions.map((interaction) => {
                        const fromAgent = state.agents.find(a => a.id === interaction.from);
                        const toAgent = state.agents.find(a => a.id === interaction.to);
                        return (
                          <div key={interaction.id} className="p-4 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-2">
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-2 text-xs font-bold">
                                <span className="text-indigo-400">{fromAgent?.name}</span>
                                <ChevronRight size={12} className="text-slate-600" />
                                <span className="text-indigo-400">{toAgent?.name}</span>
                              </div>
                              <span className="text-[10px] text-slate-500 uppercase">Round {interaction.round}</span>
                            </div>
                            <p className="text-sm text-slate-300 leading-relaxed italic">"{interaction.content}"</p>
                            <div className="flex items-center gap-2 mt-1">
                              <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                                <div 
                                  className={cn(
                                    "h-full",
                                    interaction.sentiment > 0 ? "bg-emerald-500" : "bg-red-500"
                                  )}
                                  style={{ width: `${Math.abs(interaction.sentiment) * 100}%`, marginLeft: interaction.sentiment < 0 ? '0' : 'auto' }}
                                />
                              </div>
                              <span className={cn(
                                "text-[10px] font-bold",
                                interaction.sentiment > 0 ? "text-emerald-400" : "text-red-400"
                              )}>
                                {interaction.sentiment > 0 ? '+' : ''}{interaction.sentiment.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="space-y-2">
                        {state.logs.map((log, i) => (
                          <div key={i} className="flex items-center gap-3 text-xs font-mono text-slate-400 border-b border-white/5 pb-2">
                            <span className="text-emerald-500/50">[{new Date().toLocaleTimeString()}]</span>
                            <span>{log}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 gap-4 border-2 border-dashed border-white/5 rounded-2xl">
                {state.mode === 'prediction' ? <Users size={48} strokeWidth={1} /> : <Cpu size={48} strokeWidth={1} />}
                <p className="text-sm">Initialize a simulation to see agent {state.mode === 'prediction' ? 'interactions' : 'progress'}</p>
              </div>
            )}

            {/* Simulation Progress Overlay */}
            {state.status === 'running' && (
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 glass px-6 py-3 rounded-full flex items-center gap-4 shadow-2xl">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-indigo-400">ROUND {state.currentRound}/{state.maxRounds}</span>
                  <div className="w-32 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-indigo-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${(state.currentRound / state.maxRounds) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="w-px h-4 bg-white/10" />
                <span className="text-xs text-slate-300 animate-pulse">Processing emergent behaviors...</span>
              </div>
            )}
          </div>

          {/* Report Modal/Overlay */}
          <AnimatePresence>
            {showReport && state.report && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="absolute inset-x-4 bottom-4 top-16 glass rounded-2xl p-8 overflow-y-auto z-40 shadow-2xl border-indigo-500/20"
              >
                <div className="flex justify-between items-start mb-8">
                  <div>
                    <h2 className="text-3xl font-bold text-white mb-2">Prediction Analysis</h2>
                    <p className="text-slate-400">Emergent behavior synthesis based on {state.agents.length} intelligent agents.</p>
                  </div>
                  <button 
                    onClick={() => setShowReport(false)}
                    className="p-2 hover:bg-white/10 rounded-full transition-all"
                  >
                    <X size={24} />
                  </button>
                </div>
                <div className="markdown-body">
                  <Markdown>{state.report}</Markdown>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Sidebar - Agent Details & Chat */}
        <AnimatePresence>
          {selectedAgent && (
            <motion.aside 
              initial={{ x: 400 }}
              animate={{ x: 0 }}
              exit={{ x: 400 }}
              className="w-96 border-l border-white/10 flex flex-col glass z-50"
            >
              <div className="p-6 border-b border-white/10 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-600/20 flex items-center justify-center text-indigo-400 font-bold">
                    {selectedAgent.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-bold text-white leading-tight">{selectedAgent.name}</h3>
                    <p className="text-xs text-slate-500">{selectedAgent.role}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedAgent(null)} className="p-1 hover:bg-white/5 rounded-lg">
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 custom-scrollbar">
                <section>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Personality Traits</label>
                  <div className="flex flex-wrap gap-2">
                    {selectedAgent.traits.map(trait => (
                      <span key={trait} className="px-2 py-1 rounded-md bg-indigo-500/10 text-indigo-400 text-[10px] font-bold uppercase border border-indigo-500/20">
                        {trait}
                      </span>
                    ))}
                  </div>
                </section>

                <section>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Personality Profile</label>
                  <p className="text-sm text-slate-300 leading-relaxed bg-white/5 p-3 rounded-lg border border-white/5 italic">
                    "{selectedAgent.personality}"
                  </p>
                </section>

                <section className="flex-1 flex flex-col">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 block flex items-center gap-2">
                    <MessageSquare size={12} /> Direct Inquiry
                  </label>
                  
                  <div className="flex-1 bg-slate-900/50 rounded-xl border border-white/5 p-4 flex flex-col gap-4 overflow-y-auto mb-4 min-h-[200px]">
                    {chatHistory.length === 0 ? (
                      <div className="flex-1 flex items-center justify-center text-center p-4">
                        <p className="text-xs text-slate-500">Ask {selectedAgent.name} about their reasoning or perspective on the simulation.</p>
                      </div>
                    ) : (
                      chatHistory.map((msg, i) => (
                        <div key={i} className={cn(
                          "max-w-[85%] p-3 rounded-2xl text-sm",
                          msg.role === 'user' 
                            ? "bg-indigo-600 text-white self-end rounded-tr-none" 
                            : "bg-white/10 text-slate-200 self-start rounded-tl-none"
                        )}>
                          {msg.content}
                        </div>
                      ))
                    )}
                    {isChatting && (
                      <div className="bg-white/10 text-slate-200 self-start rounded-2xl rounded-tl-none p-3 text-sm flex gap-1">
                        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
                        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                      </div>
                    )}
                  </div>

                  <div className="relative">
                    <input 
                      type="text"
                      className="w-full bg-slate-900 border border-white/10 rounded-xl py-3 pl-4 pr-12 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder={`Message ${selectedAgent.name.split(' ')[0]}...`}
                      value={chatMessage}
                      onChange={(e) => setChatMessage(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    />
                    <button 
                      onClick={handleSendMessage}
                      className="absolute right-2 top-1.5 p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-all"
                    >
                      <Send size={16} />
                    </button>
                  </div>
                </section>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </main>

      {/* Configuration Modal */}
      <AnimatePresence>
        {showConfigModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-8">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowConfigModal(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-4xl max-h-[80vh] glass rounded-3xl overflow-hidden flex flex-col shadow-2xl border-indigo-500/20"
            >
              <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
                <div>
                  <h2 className="text-xl font-bold text-white">Customize Agents</h2>
                  <p className="text-sm text-slate-400">Refine traits and memories before starting the simulation.</p>
                </div>
                <button 
                  onClick={() => setShowConfigModal(false)}
                  className="p-2 hover:bg-white/10 rounded-full transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 grid grid-cols-2 gap-6 custom-scrollbar">
                {state.agents.map(agent => (
                  <div key={agent.id} className="p-4 rounded-2xl bg-white/5 border border-white/10 flex flex-col gap-4">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-600/20 flex items-center justify-center text-indigo-400 text-xs font-bold">
                          {agent.name.charAt(0)}
                        </div>
                        <input 
                          className="bg-transparent font-bold text-white outline-none border-b border-transparent focus:border-indigo-500"
                          value={agent.name}
                          onChange={(e) => updateAgent(agent.id, { name: e.target.value })}
                        />
                      </div>
                      <button 
                        onClick={() => setState(prev => ({ ...prev, agents: prev.agents.filter(a => a.id !== agent.id) }))}
                        className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Traits (comma separated)</label>
                      <input 
                        className="w-full bg-slate-950/50 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 outline-none focus:border-indigo-500"
                        value={agent.traits.join(', ')}
                        onChange={(e) => updateAgent(agent.id, { traits: e.target.value.split(',').map(t => t.trim()) })}
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Personality Profile</label>
                      <textarea 
                        className="w-full bg-slate-950/50 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 outline-none focus:border-indigo-500 h-20 resize-none"
                        value={agent.personality}
                        onChange={(e) => updateAgent(agent.id, { personality: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Memory Entries</label>
                      <div className="space-y-2">
                        {agent.memory.map((m, idx) => (
                          <div key={idx} className="flex gap-2">
                            <input 
                              className="flex-1 bg-slate-950/50 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 outline-none focus:border-indigo-500"
                              value={m}
                              onChange={(e) => {
                                const newMemory = [...agent.memory];
                                newMemory[idx] = e.target.value;
                                updateAgent(agent.id, { memory: newMemory });
                              }}
                            />
                            <button 
                              onClick={() => {
                                const newMemory = agent.memory.filter((_, i) => i !== idx);
                                updateAgent(agent.id, { memory: newMemory });
                              }}
                              className="p-2 text-slate-500 hover:text-red-400 transition-colors"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                        <button 
                          onClick={() => updateAgent(agent.id, { memory: [...agent.memory, ''] })}
                          className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold uppercase flex items-center gap-1 mt-1"
                        >
                          <Plus size={12} /> Add Memory
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                
                <button 
                  onClick={() => {
                    const id = `agent-${state.agents.length}`;
                    setState(prev => ({
                      ...prev,
                      agents: [...prev.agents, {
                        id,
                        name: 'New Agent',
                        role: 'Observer',
                        personality: 'A neutral observer of events.',
                        traits: ['neutral'],
                        memory: ['Joined the simulation.'],
                        status: 'idle',
                        sentiment: 0,
                        sentimentHistory: [{ round: 0, value: 0 }]
                      }]
                    }));
                  }}
                  className="p-4 rounded-2xl border-2 border-dashed border-white/5 hover:border-indigo-500/50 hover:bg-indigo-500/5 text-slate-500 hover:text-indigo-400 transition-all flex flex-col items-center justify-center gap-2"
                >
                  <Plus size={24} />
                  <span className="text-xs font-bold uppercase tracking-widest">Add Agent</span>
                </button>
              </div>

              <div className="p-6 border-t border-white/10 bg-white/5 flex justify-end">
                <button 
                  onClick={() => {
                    setShowConfigModal(false);
                    runSimulation();
                  }}
                  className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-600/20"
                >
                  Start Simulation
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}

function SidebarIcon({ icon, active, onClick, tooltip }: { icon: React.ReactNode, active: boolean, onClick: () => void, tooltip: string }) {
  return (
    <div className="relative group">
      <button 
        onClick={onClick}
        className={cn(
          "w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300",
          active 
            ? "bg-blue-600 text-white shadow-[0_0_20px_-5px_rgba(59,130,246,0.5)]" 
            : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
        )}
      >
        {icon}
      </button>
      <div className="absolute left-full ml-4 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-all whitespace-nowrap z-50 border border-white/5">
        {tooltip}
      </div>
    </div>
  );
}
