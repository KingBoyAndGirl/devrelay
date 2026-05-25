'use client';

import { useState, useEffect } from 'react';
import { X, Lightbulb } from 'lucide-react';

interface OnboardingTooltipProps {
  id: string;           // Unique key for this tip (stored in localStorage)
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Where to position relative to children */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Auto-show after this many ms (default 800) */
  delay?: number;
  /** Only show when this is true */
  showWhen?: boolean;
}

const STORAGE_KEY = 'devrelay-onboarding-dismissed';

function getDismissedTips(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function dismissTip(id: string) {
  const tips = getDismissedTips();
  if (!tips.includes(id)) {
    tips.push(id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tips));
  }
}

export function OnboardingTooltip({
  id,
  title,
  description,
  children,
  position = 'bottom',
  delay = 800,
  showWhen = true,
}: OnboardingTooltipProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = getDismissedTips();
    if (dismissed.includes(id) || !showWhen) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [id, showWhen, delay]);

  if (!visible) return <>{children}</>;

  const positionStyles: Record<string, string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  function handleDismiss() {
    dismissTip(id);
    setVisible(false);
  }

  return (
    <div className="relative inline-block">
      <div className={`absolute z-50 ${positionStyles[position]} w-64`}>
        <div className="bg-blue-600 text-white rounded-xl shadow-xl p-4 fade-in relative">
          <button
            onClick={handleDismiss}
            className="absolute top-2 right-2 text-blue-300 hover:text-white transition-colors"
          >
            <X size={14} />
          </button>
          <div className="flex items-start gap-2 mb-1">
            <Lightbulb size={16} className="text-yellow-300 shrink-0 mt-0.5" />
            <p className="text-sm font-semibold">{title}</p>
          </div>
          {description && (
            <p className="text-xs text-blue-200 mt-1">{description}</p>
          )}
          <button
            onClick={handleDismiss}
            className="mt-2 text-xs px-3 py-1 bg-blue-500 hover:bg-blue-400 rounded-lg transition-colors"
          >
            知道了
          </button>
        </div>
        {/* Arrow */}
        <div className={`absolute ${
          position === 'top' ? 'top-full left-1/2 -translate-x-1/2 border-t-blue-600 border-b-transparent' :
          position === 'bottom' ? 'bottom-full left-1/2 -translate-x-1/2 border-b-blue-600 border-t-transparent' :
          position === 'left' ? 'left-full top-1/2 -translate-y-1/2 border-l-blue-600 border-r-transparent' :
          'right-full top-1/2 -translate-y-1/2 border-r-blue-600 border-l-transparent'
        } border-8 border-transparent`} />
      </div>
      {children}
    </div>
  );
}

export function resetAllTips() {
  localStorage.removeItem(STORAGE_KEY);
}

export function isTipDismissed(id: string): boolean {
  return getDismissedTips().includes(id);
}
