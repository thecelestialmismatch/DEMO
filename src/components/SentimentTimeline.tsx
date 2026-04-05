import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Agent } from '../types';

interface TimelineProps {
  agents: Agent[];
}

export const SentimentTimeline: React.FC<TimelineProps> = ({ agents }) => {
  // Aggregate sentiment by round
  const rounds = agents[0]?.sentimentHistory.map(h => h.round) || [];
  const data = rounds.map(round => {
    const roundData: any = { round };
    agents.forEach(agent => {
      const history = agent.sentimentHistory.find(h => h.round === round);
      if (history) {
        roundData[agent.name] = history.value;
      }
    });
    return roundData;
  });

  // Calculate average sentiment
  const avgData = rounds.map(round => {
    const values = agents.map(a => a.sentimentHistory.find(h => h.round === round)?.value).filter(v => v !== undefined) as number[];
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return { round, average: avg };
  });

  return (
    <div className="w-full h-full bg-slate-950/50 rounded-xl p-4 flex flex-col">
      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Sentiment Analysis Timeline</h3>
      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={avgData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis 
              dataKey="round" 
              stroke="#64748b" 
              fontSize={12} 
              tickFormatter={(val) => `Round ${val}`}
            />
            <YAxis 
              stroke="#64748b" 
              fontSize={12} 
              domain={[-1, 1]}
            />
            <Tooltip 
              contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
              itemStyle={{ color: '#e2e8f0' }}
            />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="average" 
              stroke="#6366f1" 
              strokeWidth={3} 
              dot={{ fill: '#6366f1', r: 4 }}
              activeDot={{ r: 6 }}
              name="Average Sentiment"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
