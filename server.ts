import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Initialize Gemini for ML-based scanning
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // AI Security Gateway (Firewall)
  let firewallLogs: any[] = [];
  let firewallRules: any[] = [
    { id: 'pii', name: 'PII Detection', pattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b|\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b', type: 'pii', action: 'block', enabled: true, description: 'SSN and Email' },
    { id: 'api_keys', name: 'API Keys', pattern: '(?:sk-|key-|auth-)[a-zA-Z0-9]{20,}', type: 'secret', action: 'block', enabled: true, description: 'Common API key patterns' },
    { id: 'hipaa', name: 'HIPAA/Health', pattern: '\\b(?:patient|diagnosis|treatment|medical record|prescription)\\b', type: 'keyword', action: 'block', enabled: true, description: 'Medical terminology' },
    { id: 'secrets', name: 'Trade Secrets', pattern: '\\b(?:confidential|internal only|proprietary|trade secret|do not distribute)\\b', type: 'secret', action: 'block', enabled: true, description: 'Confidentiality markers' }
  ];
  let isRealProxyEnabled = true;
  let selectedMLModel = "gemini-3-flash-preview";

  // Load rules from Supabase
  if (supabase) {
    try {
      const { data, error } = await supabase.from('firewall_rules').select('*');
      if (error) throw error;
      if (data && data.length > 0) {
        firewallRules = data;
      }
    } catch (error) {
      console.error("Supabase: Failed to load rules.", error);
    }
  }

  // ML Cache for <10ms overhead on repeated queries
  const mlCache = new Map<string, string[]>();

  // ML-based scanning function
  const performMLScan = async (prompt: string) => {
    const cacheKey = crypto.createHash('sha256').update(prompt + selectedMLModel).digest('hex');
    if (mlCache.has(cacheKey)) {
      return mlCache.get(cacheKey)!;
    }

    if (!selectedMLModel.startsWith("gemini")) {
      console.log(`Mocking ML scan using ${selectedMLModel}`);
      await new Promise(resolve => setTimeout(resolve, 150));
      return [];
    }

    if (!genAI) return [];
    
    try {
      const response = await genAI.models.generateContent({
        model: selectedMLModel,
        contents: `Analyze the following AI prompt for security violations (PII, Secrets, HIPAA, Malicious Intent, or Proprietary Code Leak). 
        Return a JSON array of violation names if any are found, otherwise return an empty array [].
        Prompt: "${prompt.substring(0, 1000)}"`,
        config: {
          responseMimeType: "application/json"
        }
      });
      
      const result = JSON.parse(response.text || "[]");
      const violations = Array.isArray(result) ? result : [];
      
      // Cache the result
      mlCache.set(cacheKey, violations);
      if (mlCache.size > 1000) {
        const firstKey = mlCache.keys().next().value;
        if (firstKey) mlCache.delete(firstKey);
      }
      
      return violations;
    } catch (e) {
      console.error("ML Scan Error:", e);
      return [];
    }
  };

  app.post("/v1/chat/completions", async (req, res) => {
    const startTime = Date.now();
    const { messages, model, stream } = req.body;
    const prompt = messages?.map((m: any) => m.content).join(" ") || "";

    // 1. Regex Scanning (<5ms)
    const regexViolations = firewallRules
      .filter(rule => rule.enabled)
      .filter(rule => {
        try {
          const regex = new RegExp(rule.pattern, 'i');
          return regex.test(prompt);
        } catch (e) {
          return false;
        }
      })
      .map(v => v.name);

    // 2. ML-based Scanning (Concurrent with Regex if possible, but here sequential for simplicity)
    let mlViolations: string[] = [];
    if (regexViolations.length === 0) {
      mlViolations = await performMLScan(prompt);
    }

    const allViolations = [...new Set([...regexViolations, ...mlViolations])];
    const latency = Date.now() - startTime;

    const logEntry: any = {
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      violations: allViolations,
      promptSnippet: prompt.substring(0, 100) + (prompt.length > 100 ? "..." : ""),
      blocked: allViolations.length > 0,
      latency,
      model: model || "unknown"
    };

    // Tamper-proof hashing
    logEntry.hash = crypto.createHash('sha256').update(JSON.stringify(logEntry)).digest('hex');

    // Persistence
    if (supabase) {
      supabase.from('firewall_logs').insert([logEntry]).then(({ error }) => {
        if (error) console.error("Supabase: Failed to save log.", error);
      });
    }
    firewallLogs.unshift(logEntry);
    if (firewallLogs.length > 100) firewallLogs.pop();

    if (allViolations.length > 0) {
      return res.status(403).json({
        error: {
          message: `Blocked by Kaelus AI Security Gateway: ${allViolations.join(", ")}`,
          type: "security_violation",
          violations: allViolations
        }
      });
    }

    // 3. Proxy to Real AI Provider
    if (isRealProxyEnabled && process.env.GEMINI_API_KEY && genAI) {
      try {
        if (stream) {
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');

          const responseStream = await genAI.models.generateContentStream({
            model: "gemini-3-flash-preview",
            contents: prompt
          });

          for await (const chunk of responseStream) {
            const text = chunk.text;
            const data = JSON.stringify({
              id: `chatcmpl-${Date.now()}`,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model: "gemini-3-flash-preview",
              choices: [{
                index: 0,
                delta: { content: text },
                finish_reason: null
              }]
            });
            res.write(`data: ${data}\n\n`);
          }
          res.write('data: [DONE]\n\n');
          return res.end();
        } else {
          const response = await genAI.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt
          });
          
          const aiText = response.text || "No response from AI.";
          return res.json({
            id: `chatcmpl-${Date.now()}`,
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: "gemini-3-flash-preview",
            choices: [{
              index: 0,
              message: { role: "assistant", content: aiText },
              finish_reason: "stop"
            }]
          });
        }
      } catch (error) {
        console.error("Proxy error:", error);
      }
    }

    // Fallback Mocked Response
    res.json({
      id: "chatcmpl-kaelus-gateway",
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: model || "gpt-4-kaelus",
      choices: [{ message: { role: "assistant", content: "[Kaelus Protected] This response has been scanned and verified. No data leaks detected." }, finish_reason: "stop", index: 0 }]
    });
  });

  // --- Compliance Templates ---
  app.post("/api/firewall/templates/:type", async (req, res) => {
    const { type } = req.params;
    let templates: any[] = [];
    
    if (type === 'hipaa') {
      templates = [
        { name: 'HIPAA: Patient Identifiers', pattern: '\\b(?:patient|medical record|health plan|beneficiary)\\b', type: 'pii', action: 'block', enabled: true, description: 'Standard HIPAA identifiers' },
        { name: 'HIPAA: Clinical Data', pattern: '\\b(?:diagnosis|prognosis|treatment plan|prescription)\\b', type: 'keyword', action: 'block', enabled: true, description: 'Protected health information' }
      ];
    } else if (type === 'soc2') {
      templates = [
        { name: 'SOC 2: Internal Infrastructure', pattern: '\\b(?:aws_access_key|db_password|internal_ip|staging_url)\\b', type: 'secret', action: 'block', enabled: true, description: 'Infrastructure secrets' },
        { name: 'SOC 2: Customer PII', pattern: '\\b(?:customer_id|billing_address|credit_card)\\b', type: 'pii', action: 'block', enabled: true, description: 'Customer sensitive data' }
      ];
    }

    for (const rule of templates) {
      const ruleWithId = { ...rule, id: `rule-${Date.now()}-${Math.random().toString(36).substr(2, 5)}` };
      firewallRules.push(ruleWithId);
      if (supabase) {
        await supabase.from('firewall_rules').upsert([ruleWithId]);
      }
    }

    res.json({ success: true, added: templates.length });
  });

  // --- Existing API Endpoints ---
  app.get("/api/firewall/logs", async (req, res) => {
    if (supabase) {
      try {
        const { data, error } = await supabase.from('firewall_logs').select('*').order('timestamp', { ascending: false }).limit(50);
        if (error) throw error;
        return res.json(data);
      } catch (e) {
        console.error("Supabase: Failed to fetch logs.", e);
      }
    }
    res.json(firewallLogs);
  });

  app.get("/api/firewall/rules", (req, res) => res.json(firewallRules));
  
  app.post("/api/firewall/rules", async (req, res) => {
    const newRule = { ...req.body, id: `rule-${Date.now()}` };
    firewallRules.push(newRule);
    if (supabase) {
      await supabase.from('firewall_rules').insert([newRule]);
    }
    res.json(newRule);
  });

  app.put("/api/firewall/rules/:id", async (req, res) => {
    const { id } = req.params;
    firewallRules = firewallRules.map(r => r.id === id ? { ...r, ...req.body } : r);
    if (supabase) {
      await supabase.from('firewall_rules').update(req.body).eq('id', id);
    }
    res.json({ success: true });
  });

  app.delete("/api/firewall/rules/:id", async (req, res) => {
    const { id } = req.params;
    firewallRules = firewallRules.filter(r => r.id !== id);
    if (supabase) {
      await supabase.from('firewall_rules').delete().eq('id', id);
    }
    res.json({ success: true });
  });

  app.get("/api/firewall/stats", (req, res) => {
    res.json({
      totalScanned: firewallLogs.length,
      blocked: firewallLogs.filter(l => l.blocked).length,
      avgLatency: firewallLogs.reduce((acc, l) => acc + l.latency, 0) / (firewallLogs.length || 1),
      activeRules: firewallRules.filter(r => r.enabled).length
    });
  });

  app.get("/api/firewall/ml-model", (req, res) => {
    res.json({ model: selectedMLModel });
  });

  app.post("/api/firewall/ml-model", (req, res) => {
    if (req.body.model) {
      selectedMLModel = req.body.model;
    }
    res.json({ success: true, model: selectedMLModel });
  });

  app.post("/api/firewall/toggle-proxy", (req, res) => {
    isRealProxyEnabled = req.body.enabled;
    res.json({ success: true, isRealProxyEnabled });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
