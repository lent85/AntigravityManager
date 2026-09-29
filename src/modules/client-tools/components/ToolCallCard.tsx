import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, ChevronDown, ChevronRight, CornerDownLeft, Wrench } from 'lucide-react';
import type { ToolCallItem } from '../types';
import { getMockToolResponse } from '../presets/default-tools';

interface ToolCallCardProps {
  toolCall: ToolCallItem;
  existingResult?: string;
  isSubmitting?: boolean;
  onSubmitResult?: (toolCallId: string, toolName: string, result: string) => void;
}

export function ToolCallCard({
  toolCall,
  existingResult,
  isSubmitting = false,
  onSubmitResult,
}: ToolCallCardProps) {
  const { t } = useTranslation();
  const [showArgs, setShowArgs] = useState(true);

  let parsedArgs: Record<string, unknown> = {};
  try {
    const rawParsed: unknown = JSON.parse(toolCall.function.arguments || '{}');
    if (typeof rawParsed === 'object' && rawParsed !== null) {
      parsedArgs = rawParsed as Record<string, unknown>;
    }
  } catch {
    parsedArgs = { raw: toolCall.function.arguments };
  }

  const [mockOutput, setMockOutput] = useState<string>(() => {
    if (existingResult) {
      return existingResult;
    }
    return getMockToolResponse(toolCall.function.name, parsedArgs);
  });

  const isCompleted = typeof existingResult === 'string';

  return (
    <Card className="my-2 overflow-hidden border-amber-500/30 bg-amber-500/5 text-xs shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-amber-500/20 px-3 py-2 bg-amber-500/10">
        <div className="flex items-center gap-2">
          <div className="flex size-5 items-center justify-center rounded bg-amber-500/20 text-amber-600 dark:text-amber-400">
            <Wrench className="size-3" />
          </div>
          <span className="font-semibold text-amber-900 dark:text-amber-200">
            {t('client-tools.tool-call.header', 'Function Call Request')}
          </span>
          <Badge variant="outline" className="font-mono text-[11px] bg-background/80">
            {toolCall.function.name}
          </Badge>
          <span className="text-muted-foreground font-mono text-[10px]">
            id: {toolCall.id}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isCompleted ? (
            <Badge variant="secondary" className="gap-1 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-3" />
              {t('client-tools.tool-call.completed', 'Executed')}
            </Badge>
          ) : (
            <Badge variant="outline" className="animate-pulse border-amber-500/40 text-amber-600 dark:text-amber-400">
              {t('client-tools.tool-call.pending', 'Awaiting Result')}
            </Badge>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-muted-foreground"
            onClick={() => setShowArgs(!showArgs)}
          >
            {showArgs ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </Button>
        </div>
      </div>

      {/* Body: Arguments */}
      {showArgs && (
        <div className="space-y-2 p-3">
          <div>
            <span className="text-[11px] font-medium text-muted-foreground">
              {t('client-tools.tool-call.arguments', 'Arguments passed by model')}:
            </span>
            <pre className="mt-1 max-h-40 overflow-auto rounded bg-background/80 p-2 font-mono text-[11px] border border-border/50 text-foreground">
              {JSON.stringify(parsedArgs, null, 2)}
            </pre>
          </div>

          {/* Result Section */}
          <div className="pt-1">
            <span className="text-[11px] font-medium text-muted-foreground">
              {isCompleted
                ? t('client-tools.tool-call.returned-result', 'Simulated Execution Result:')
                : t('client-tools.tool-call.provide-result', 'Provide Tool Result to send back:')}
            </span>

            {isCompleted ? (
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-emerald-500/5 p-2 font-mono text-[11px] border border-emerald-500/30 text-emerald-900 dark:text-emerald-300">
                {existingResult}
              </pre>
            ) : (
              <div className="mt-1 space-y-2">
                <textarea
                  rows={4}
                  value={mockOutput}
                  onChange={(e) => setMockOutput(e.target.value)}
                  disabled={isSubmitting}
                  className="border-input bg-background font-mono text-[11px] ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex w-full resize-y rounded-md border p-2 focus-visible:ring-2 focus-visible:outline-none"
                />

                <div className="flex items-center justify-end gap-2">
                  <Button
                    size="sm"
                    className="h-7 gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs"
                    disabled={isSubmitting || !mockOutput.trim()}
                    onClick={() => onSubmitResult?.(toolCall.id, toolCall.function.name, mockOutput)}
                  >
                    <CornerDownLeft className="size-3" />
                    {t('client-tools.tool-call.submit', 'Submit Tool Result & Continue')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
