/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FileText, Type, Layers } from 'lucide-react';
import { motion } from 'motion/react';
import { RepositoryStats } from '../types';

interface StatsGridProps {
  stats: RepositoryStats | null;
  loading: boolean;
}

export default function StatsGrid({ stats, loading }: StatsGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse bg-white border border-slate-200 rounded-xl p-5 h-[92px]" />
        ))}
      </div>
    );
  }

  const cards = [
    {
      id: 'stat-docs',
      title: 'Total Documents',
      value: stats?.totalDocuments ?? 0,
      description: 'Indexed & active in repository',
      icon: FileText,
      color: 'text-indigo-600 bg-indigo-50 border-indigo-100',
    },
    {
      id: 'stat-words',
      title: 'Total Indexed Words',
      value: (stats?.totalWords ?? 0).toLocaleString(),
      description: 'Embedded with gemini-embedding-2',
      icon: Type,
      color: 'text-emerald-600 bg-emerald-50 border-emerald-100',
    },
    {
      id: 'stat-categories',
      title: 'Distinct Categories',
      value: stats?.categories.length ?? 0,
      description: 'Topics represented in files',
      icon: Layers,
      color: 'text-amber-600 bg-amber-50 border-amber-100',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6" id="stats-container">
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <motion.div
            key={card.id}
            id={card.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
            className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 flex items-start gap-4 hover:border-slate-300 hover:shadow-md transition-all duration-200"
          >
            <div className={`p-2.5 rounded-lg border ${card.color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{card.title}</p>
              <h4 className="text-xl font-extrabold font-sans text-slate-800 mt-0.5">{card.value}</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">{card.description}</p>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
