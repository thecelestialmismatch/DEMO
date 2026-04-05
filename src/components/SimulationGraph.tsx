import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { motion, AnimatePresence } from 'motion/react';
import { Agent, Relationship, Interaction } from '../types';
import { cn } from '../lib/utils';
import { User, MessageSquare, Brain, Zap, Info, ShieldCheck, AlertCircle } from 'lucide-react';

interface GraphProps {
  agents: Agent[];
  relationships: Relationship[];
  interactions: Interaction[];
  onAgentClick: (agent: Agent) => void;
  filterGroup?: string;
  filterStatus?: string;
  highlightedAgentId?: string;
}

export const SimulationGraph: React.FC<GraphProps> = ({ 
  agents, 
  relationships, 
  interactions,
  onAgentClick, 
  filterGroup,
  filterStatus,
  highlightedAgentId 
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredAgent, setHoveredAgent] = useState<Agent | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Sentiment color scale: Red (-1) -> Gray (0) -> Green (1)
  const getSentimentColor = (sentiment: number) => {
    if (sentiment > 0) {
      const g = Math.round(185 + (sentiment * 70)); // Up to 255
      return `rgb(16, ${g}, 129)`;
    } else {
      const r = Math.round(239 + (Math.abs(sentiment) * 16)); // Up to 255
      return `rgb(${r}, 68, 68)`;
    }
  };

  useEffect(() => {
    if (!svgRef.current || agents.length === 0) return;

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const filteredAgents = agents.filter(a => {
      const groupMatch = !filterGroup || a.group === filterGroup;
      const statusMatch = !filterStatus || a.status === filterStatus;
      return groupMatch && statusMatch;
    });

    const filteredAgentIds = new Set(filteredAgents.map(a => a.id));
    const filteredRelationships = relationships.filter(r => 
      filteredAgentIds.has(typeof r.source === 'string' ? r.source : (r.source as any).id) && 
      filteredAgentIds.has(typeof r.target === 'string' ? r.target : (r.target as any).id)
    );

    const simulation = d3.forceSimulation(filteredAgents as any)
      .force("link", d3.forceLink(filteredRelationships).id((d: any) => d.id).distance(150))
      .force("charge", d3.forceManyBody().strength(-400))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(60));

    const g = svg.append("g");

    svg.call(d3.zoom().on("zoom", (event) => {
      g.attr("transform", event.transform);
    }) as any);

    const link = g.append("g")
      .selectAll("line")
      .data(filteredRelationships)
      .enter().append("line")
      .attr("stroke", "#4f46e5")
      .attr("stroke-opacity", 0.3)
      .attr("stroke-width", (d) => Math.sqrt(d.strength) * 2);

    const node = g.append("g")
      .selectAll("g")
      .data(filteredAgents)
      .enter().append("g")
      .attr("class", "agent-node cursor-pointer")
      .on("click", (event, d: any) => onAgentClick(d))
      .on("mouseenter", (event, d: any) => {
        setHoveredAgent(d);
        setTooltipPos({ x: event.pageX, y: event.pageY });
      })
      .on("mousemove", (event) => {
        setTooltipPos({ x: event.pageX, y: event.pageY });
      })
      .on("mouseleave", () => {
        setHoveredAgent(null);
      })
      .call(d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended) as any);

    // Pulsing effect for agents in recent interactions
    const latestInteractions = interactions.slice(-3);
    const latestInteractionIds = new Set(latestInteractions.flatMap(i => [i.from, i.to]));

    node.filter((d: any) => latestInteractionIds.has(d.id))
      .append("circle")
      .attr("r", 25)
      .attr("fill", "none")
      .attr("stroke", (d: any) => {
        const interaction = latestInteractions.find(i => i.from === d.id || i.to === d.id);
        return interaction && interaction.sentiment > 0 ? "#10b981" : "#ef4444";
      })
      .attr("stroke-width", 1)
      .attr("stroke-opacity", (d: any) => {
        const interaction = latestInteractions.find(i => i.from === d.id || i.to === d.id);
        return interaction ? 0.1 + (Math.abs(interaction.sentiment) * 0.3) : 0.2;
      })
      .attr("class", "pulse-circle")
      .each(function(d: any) {
        const interaction = latestInteractions.find(i => i.from === d.id || i.to === d.id);
        const intensity = interaction ? Math.abs(interaction.sentiment) : 0.5;
        
        const repeat = () => {
          d3.select(this)
            .attr("r", 25)
            .attr("stroke-opacity", 0.3)
            .transition()
            .duration(2000 - (intensity * 1500)) // Faster pulse for higher intensity
            .ease(d3.easeQuadOut)
            .attr("r", 35 + (intensity * 15))
            .attr("stroke-opacity", 0)
            .on("end", repeat);
        };
        repeat();
      });

    // Main node circle - Gradient based on sentiment
    node.append("circle")
      .attr("r", 25)
      .attr("fill", (d: any) => getSentimentColor(d.sentiment))
      .attr("fill-opacity", 0.9)
      .attr("stroke", (d: any) => d.id === highlightedAgentId ? "#ffffff" : "rgba(255,255,255,0.1)")
      .attr("stroke-width", (d: any) => d.id === highlightedAgentId ? 3 : 1)
      .attr("filter", (d: any) => {
        const color = d.sentiment > 0 ? "16, 185, 129" : "239, 68, 68";
        return `drop-shadow(0 0 12px rgba(${color}, 0.4))`;
      });

    // Sentiment indicator ring (outer) - Dynamic thickness and glow
    node.append("circle")
      .attr("r", 28)
      .attr("fill", "none")
      .attr("stroke", (d: any) => {
        const opacity = 0.3 + (Math.abs(d.sentiment) * 0.7);
        return d.sentiment > 0 ? `rgba(16, 185, 129, ${opacity})` : `rgba(239, 68, 68, ${opacity})`;
      })
      .attr("stroke-width", (d: any) => 1 + (Math.abs(d.sentiment) * 6))
      .attr("stroke-dasharray", (d: any) => {
        const circumference = 2 * Math.PI * 28;
        return `${Math.abs(d.sentiment) * circumference} ${circumference}`;
      })
      .attr("filter", (d: any) => {
        const color = d.sentiment > 0 ? "16, 185, 129" : "239, 68, 68";
        return `drop-shadow(0 0 8px rgba(${color}, ${Math.abs(d.sentiment) * 0.6}))`;
      });

    // Status indicator dot with animation
    node.append("circle")
      .attr("r", 6)
      .attr("cx", 18)
      .attr("cy", -18)
      .attr("fill", (d: any) => {
        if (d.status === 'interacting') return "#10b981";
        if (d.status === 'thinking') return "#f59e0b";
        return "#64748b";
      })
      .attr("stroke", "#0f172a")
      .attr("stroke-width", 2)
      .each(function(d: any) {
        if (d.status === 'interacting' || d.status === 'thinking') {
          const repeat = () => {
            d3.select(this)
              .transition()
              .duration(800)
              .attr("r", 8)
              .attr("fill-opacity", 0.6)
              .transition()
              .duration(800)
              .attr("r", 6)
              .attr("fill-opacity", 1)
              .on("end", repeat);
          };
          repeat();
        }
      });

    node.append("text")
      .attr("dy", 45)
      .attr("text-anchor", "middle")
      .attr("fill", "#e2e8f0")
      .attr("font-size", "12px")
      .attr("font-weight", "700")
      .text((d) => d.name);

    node.append("text")
      .attr("dy", 60)
      .attr("text-anchor", "middle")
      .attr("fill", "#94a3b8")
      .attr("font-size", "10px")
      .text((d) => d.role);

    // Interaction pulses
    interactions.slice(-5).forEach((interaction, i) => {
      const source = filteredAgents.find(a => a.id === interaction.from);
      const target = filteredAgents.find(a => a.id === interaction.to);
      if (source && target) {
        g.append("circle")
          .attr("r", 4)
          .attr("fill", interaction.sentiment > 0 ? "#10b981" : "#ef4444")
          .attr("cx", (source as any).x)
          .attr("cy", (source as any).y)
          .transition()
          .duration(1500)
          .delay(i * 300)
          .attr("cx", (target as any).x)
          .attr("cy", (target as any).y)
          .remove();
      }
    });

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    function dragstarted(event: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event: any) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event: any) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }

    return () => {
      simulation.stop();
    };
  }, [agents, relationships, interactions, onAgentClick, filterGroup, filterStatus, highlightedAgentId]);

  const getRecentInteraction = (agentId: string) => {
    return [...interactions].reverse().find(i => i.from === agentId || i.to === agentId);
  };

  return (
    <div className="w-full h-full relative">
      <svg ref={svgRef} className="w-full h-full bg-slate-950/50 rounded-xl overflow-hidden" />
      
      <AnimatePresence>
        {hoveredAgent && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            className="fixed z-50 pointer-events-none glass px-4 py-3 rounded-xl border border-white/10 shadow-2xl min-w-[240px] max-w-[320px]"
            style={{ 
              left: tooltipPos.x + 15, 
              top: tooltipPos.y + 15 
            }}
          >
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center",
                    hoveredAgent.sentiment > 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                  )}>
                    <User size={16} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-white leading-tight">{hoveredAgent.name}</span>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider">{hoveredAgent.role}</span>
                  </div>
                </div>
                <div className={cn(
                  "px-2 py-0.5 rounded text-[9px] font-bold uppercase border",
                  hoveredAgent.status === 'interacting' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                  hoveredAgent.status === 'thinking' ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                  "bg-slate-800/50 text-slate-400 border-white/5"
                )}>
                  {hoveredAgent.status}
                </div>
              </div>

              {hoveredAgent.group && (
                <div className="flex items-center gap-2 px-2 py-1 bg-white/5 rounded-lg border border-white/5">
                  <Info size={10} className="text-indigo-400" />
                  <span className="text-[10px] text-slate-300 font-medium">Group: {hoveredAgent.group}</span>
                </div>
              )}
              
              {getRecentInteraction(hoveredAgent.id) && (
                <div className="bg-slate-900/50 p-3 rounded-lg border border-white/5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1">
                      <MessageSquare size={10} className="text-slate-500" />
                      <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Latest Intel</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Zap size={10} className={cn(
                        (getRecentInteraction(hoveredAgent.id)?.sentiment || 0) > 0 ? "text-emerald-400" : "text-rose-400"
                      )} />
                      <span className="text-[9px] font-bold text-slate-400">
                        {Math.abs((getRecentInteraction(hoveredAgent.id)?.sentiment || 0) * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-300 italic leading-relaxed line-clamp-3">
                    "{getRecentInteraction(hoveredAgent.id)?.content}"
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-1.5">
                  <Brain size={12} className="text-slate-500" />
                  <span className="text-[10px] text-slate-500">Sentiment Index</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className={cn(
                        "h-full transition-all duration-500",
                        hoveredAgent.sentiment > 0 ? "bg-emerald-500" : "bg-rose-500"
                      )}
                      style={{ width: `${Math.abs(hoveredAgent.sentiment) * 100}%` }}
                    />
                  </div>
                  <span className={cn(
                    "text-[10px] font-bold min-w-[24px] text-right",
                    hoveredAgent.sentiment > 0 ? "text-emerald-400" : "text-rose-400"
                  )}>
                    {hoveredAgent.sentiment > 0 ? '+' : ''}{(hoveredAgent.sentiment * 100).toFixed(0)}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
