'use client';

import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="text-center py-12 text-gray-500">
      {Icon && <Icon className="w-10 h-10 text-gray-300 mx-auto mb-3" />}
      <p className="text-base font-medium text-gray-700 mb-1">{title}</p>
      {description && <p className="text-sm text-gray-400 mb-4">{description}</p>}
      {action && <div>{action}</div>}
    </div>
  );
}
