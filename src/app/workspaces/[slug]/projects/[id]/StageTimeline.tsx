'use client';

import { STATUS_DOT } from './types';
import type { Stage } from './types';

interface StageTimelineProps {
  stages: Stage[];
  onSelectStage: (step: number) => void;
}

export function StageTimeline({ stages, onSelectStage }: StageTimelineProps) {
  return (
    <div className="flex items-center gap-0.5 overflow-x-auto pb-2">
      {stages.map((stage, idx) => {
        const isCompleted = stage.status === 'completed';
        const isInProgress = stage.status === 'in_progress';
        const isRejected = stage.status === 'rejected';
        const isPending = stage.status === 'pending';

        return (
          <button
            key={stage.id}
            onClick={() => onSelectStage(stage.step)}
            className="flex items-center gap-1 shrink-0 group"
          >
            {/* Dot */}
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 transition-colors ${
                isInProgress ? 'bg-blue-500 ring-2 ring-blue-200' :
                isCompleted ? 'bg-green-500' :
                isRejected ? 'bg-red-500' :
                'bg-gray-300'
              } group-hover:ring-2 group-hover:ring-blue-300`}
            />
            {/* Label (shown on first, last, and active stages, all on hover) */}
            <span className={`text-[10px] text-gray-500 group-hover:text-gray-700 whitespace-nowrap ${
              isInProgress || idx === 0 || idx === stages.length - 1 || isRejected
                ? '' : 'hidden md:hidden lg:hidden group-hover:inline'
            }`}>
              {stage.step}.{stage.name.length > 4 ? stage.name.slice(0, 4) : stage.name}
            </span>
            {/* Connector line (not after last) */}
            {idx < stages.length - 1 && (
              <span className={`w-3 h-px mx-0.5 ${
                isCompleted && stages[idx + 1].status === 'completed' ? 'bg-green-300' :
                isCompleted ? 'bg-blue-200' :
                'bg-gray-200'
              }`} />
            )}
          </button>
        );
      })}
    </div>
  );
}
