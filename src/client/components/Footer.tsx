import React from 'react';
import { ShieldCheck, Heart } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="mt-auto py-8 border-t border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400 transition-colors">
      <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-300">
          <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>Local Personal Utility (localhost only)</span>
        </div>

        <p className="max-w-md text-center sm:text-right text-slate-400 dark:text-slate-500">
          Only download content you own, that is licensed for reuse, or that you have permission to download.
        </p>
      </div>
    </footer>
  );
};

