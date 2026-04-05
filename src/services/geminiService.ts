import { GoogleGenAI, Type } from "@google/genai";
import { Agent, Relationship, SimulationConfig, DevTask } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function extractActors(source: string): Promise<{ name: string; role: string; description: string; traits: string[]; group: string }[]> {
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `Extract the key actors (individuals or groups) from the following text. For each actor, provide their name, their role, a brief description of their motivations and personality, a list of 3-5 personality traits (e.g., optimistic, cautious, aggressive), and a group name they belong to.
    
    Source Material:
    ${source}
    `,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            role: { type: Type.STRING },
            description: { type: Type.STRING },
            traits: { type: Type.ARRAY, items: { type: Type.STRING } },
            group: { type: Type.STRING },
          },
          required: ["name", "role", "description", "traits", "group"],
        },
      },
    },
  });

  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error("Failed to parse actors", e);
    return [];
  }
}

export async function simulateInteraction(
  agentA: Agent,
  agentB: Agent,
  context: string,
  goal: string,
  round: number
): Promise<{ content: string; sentiment: number }> {
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `Simulate a conversation between two agents in a simulation.
    
    Context: ${context}
    Goal: ${goal}
    Round: ${round}
    
    Agent A: ${agentA.name} (${agentA.role})
    Traits: ${agentA.traits.join(", ")}
    Personality: ${agentA.personality}
    
    Agent B: ${agentB.name} (${agentB.role})
    Traits: ${agentB.traits.join(", ")}
    Personality: ${agentB.personality}
    
    Provide a brief summary of their interaction and a sentiment score from -1 (very negative/hostile) to 1 (very positive/cooperative).
    `,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          content: { type: Type.STRING, description: "Summary of the interaction" },
          sentiment: { type: Type.NUMBER, description: "Sentiment score from -1 to 1" },
        },
        required: ["content", "sentiment"],
      },
    },
  });

  try {
    return JSON.parse(response.text || '{"content": "No interaction", "sentiment": 0}');
  } catch (e) {
    return { content: "Failed to simulate interaction", sentiment: 0 };
  }
}

export async function generatePredictionReport(
  config: SimulationConfig,
  agents: Agent[],
  logs: string[]
): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `Based on the following simulation logs and agent states, generate a detailed prediction report.
    
    Prediction Goal: ${config.predictionGoal}
    
    Simulation Summary:
    ${logs.slice(-20).join("\n")}
    
    Final Agent States:
    ${agents.map(a => `${a.name} (${a.role}): ${a.memory.slice(-1)[0]}`).join("\n")}
    
    Format the report in Markdown with sections for:
    1. Executive Summary
    2. Key Emergent Behaviors
    3. Predicted Outcome
    4. Confidence Assessment
    5. Critical Factors
    `,
  });

  return response.text || "Failed to generate report.";
}

export async function getAgentResponse(agent: Agent, prompt: string, context: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `You are ${agent.name}, a ${agent.role}. 
    Your personality: ${agent.personality}
    Your recent memories: ${agent.memory.slice(-3).join(". ")}
    
    Context of the simulation: ${context}
    
    User asks: ${prompt}
    
    Respond in character. Keep it concise.`,
  });

  return response.text || "I have nothing to say.";
}

export async function planDevelopmentTasks(goal: string): Promise<{ title: string; description: string }[]> {
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `Break down the following software development goal into a series of 5-8 discrete, parallelizable tasks.
    
    Goal: ${goal}
    `,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
          },
          required: ["title", "description"],
        },
      },
    },
  });

  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    return [];
  }
}

export async function generateModuleCode(agent: Agent, task: DevTask, context: string): Promise<{ name: string; path: string; content: string; tests: string[] }> {
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `You are ${agent.name}, a ${agent.role} (Claw Agent).
    Task: ${task.title} - ${task.description}
    Context: ${context}
    
    Write the Python code for this module and a list of 3 unit tests.
    `,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          path: { type: Type.STRING },
          content: { type: Type.STRING },
          tests: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["name", "path", "content", "tests"],
      },
    },
  });

  try {
    return JSON.parse(response.text || '{"name": "error", "path": "error.py", "content": "", "tests": []}');
  } catch (e) {
    return { name: "error", path: "error.py", content: "", tests: [] };
  }
}
