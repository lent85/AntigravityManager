import React, { useEffect, useState } from 'react';
import { cn } from '@/shared/ui/utils';

interface CardVerticalRefreshProgressProps {
  isRefreshing?: boolean;
  className?: string;
}

export const CardVerticalRefreshProgress: React.FC<CardVerticalRefreshProgressProps> = ({
  isRefreshing = false,
  className,
}) => {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    let finishTimeout: NodeJS.Timeout | null = null;
    let hideTimeout: NodeJS.Timeout | null = null;

    if (isRefreshing) {
      setVisible(true);
      setIsFinishing(false);
      setProgress(5);

      const startTime = Date.now();
      interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        setProgress((prev) => {
          if (elapsed < 350) {
            // Rapid initial fill (5% -> 30%)
            return Math.min(30, prev + 3);
          } else if (elapsed < 1200) {
            // Steady progression (30% -> 65%)
            return Math.min(65, prev + 1.5);
          } else if (elapsed < 2600) {
            // Smooth approach (65% -> 85%)
            return Math.min(85, prev + 0.8);
          } else {
            // Gentle crawl towards 94% while awaiting network response
            return Math.min(94, prev + 0.2);
          }
        });
      }, 50);
    } else if (visible) {
      // Completed! Fill the rest of the vertical left edge to 100%
      setIsFinishing(true);
      setProgress(100);

      finishTimeout = setTimeout(() => {
        hideTimeout = setTimeout(() => {
          setVisible(false);
          setIsFinishing(false);
          setProgress(0);
        }, 300);
      }, 250);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
      if (finishTimeout) {
        clearTimeout(finishTimeout);
      }
      if (hideTimeout) {
        clearTimeout(hideTimeout);
      }
    };
  }, [isRefreshing]);

  if (!visible) {
    return null;
  }

  return (
    <div
      className={cn(
        'absolute left-0 top-0 bottom-0 pointer-events-none z-20 transition-opacity duration-300',
        isFinishing ? 'opacity-90' : 'opacity-100',
        className,
      )}
      style={{ width: '2.5px' }}
      aria-hidden="true"
    >
      {/* Subtle track line along the entire left border */}
      <div className="absolute inset-0 bg-blue-500/15 dark:bg-blue-400/10" />

      {/* Vertical progress bar streaming down from top to bottom */}
      <div
        className={cn(
          'absolute left-0 top-0 w-full transition-[height] ease-out rounded-b-full',
          isFinishing ? 'duration-200' : 'duration-100',
          isFinishing
            ? 'bg-gradient-to-b from-blue-500 via-sky-400 to-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]'
            : 'bg-gradient-to-b from-blue-500 via-sky-400 to-indigo-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]',
        )}
        style={{ height: `${progress}%` }}
      >
        {/* Glowing bead at the leading tip */}
        <div
          className={cn(
            'absolute bottom-0 -left-[1px] -right-[1px] h-2 rounded-full blur-[0.5px]',
            isFinishing ? 'bg-emerald-300' : 'bg-sky-200 shadow-[0_0_6px_#38bdf8]',
          )}
        />
      </div>
    </div>
  );
};
