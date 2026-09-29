import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ToolDefinition } from '../types';

interface ToolDefinitionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tool: ToolDefinition | null;
  onSave: (tool: ToolDefinition) => void;
}

interface ToolDefinitionFormProps {
  tool: ToolDefinition | null;
  onSave: (tool: ToolDefinition) => void;
  onCancel: () => void;
}

function ToolDefinitionForm({ tool, onSave, onCancel }: ToolDefinitionFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(() => tool?.name || '');
  const [description, setDescription] = useState(() => tool?.description || '');
  const [parametersJson, setParametersJson] = useState(() => {
    if (tool?.parametersJson) {
      return tool.parametersJson;
    }
    return JSON.stringify(
      {
        type: 'object',
        properties: {
          param1: {
            type: 'string',
            description: 'Example parameter description',
          },
        },
        required: ['param1'],
      },
      null,
      2,
    );
  });
  const [jsonError, setJsonError] = useState<string | null>(null);

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }

    try {
      const parsed: unknown = JSON.parse(parametersJson);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setJsonError('Parameters schema must be a valid JSON object');
        return;
      }
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : 'Invalid JSON format');
      return;
    }

    onSave({
      id: tool?.id || `tool_${Date.now()}`,
      enabled: tool?.enabled ?? true,
      name: trimmedName,
      description: description.trim(),
      parametersJson,
    });
  };

  return (
    <>
      <div className="space-y-4 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="tool-name">{t('client-tools.dialog.name-label', 'Function Name')}</Label>
          <Input
            id="tool-name"
            placeholder="e.g. get_stock_price"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="font-mono text-xs"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tool-desc">{t('client-tools.dialog.desc-label', 'Description')}</Label>
          <Input
            id="tool-desc"
            placeholder="What this function does and when the model should call it"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="tool-params">
              {t('client-tools.dialog.params-label', 'Parameters (JSON Schema)')}
            </Label>
            {jsonError && <span className="text-[11px] text-destructive">{jsonError}</span>}
          </div>
          <textarea
            id="tool-params"
            rows={8}
            value={parametersJson}
            onChange={(e) => {
              setParametersJson(e.target.value);
              setJsonError(null);
            }}
            className="border-input bg-muted/30 font-mono text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex w-full resize-y rounded-md border p-2.5 focus-visible:ring-2 focus-visible:outline-none"
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          {t('common.cancel', 'Cancel')}
        </Button>
        <Button onClick={handleSave} disabled={!name.trim()}>
          {t('common.save', 'Save Tool')}
        </Button>
      </DialogFooter>
    </>
  );
}

export function ToolDefinitionDialog({
  open,
  onOpenChange,
  tool,
  onSave,
}: ToolDefinitionDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {tool
              ? t('client-tools.dialog.edit-title', 'Edit Tool Definition')
              : t('client-tools.dialog.create-title', 'Add Custom Tool')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'client-tools.dialog.description',
              'Declare function schema in OpenAI format so AI models can decide to call this tool.',
            )}
          </DialogDescription>
        </DialogHeader>

        {open && (
          <ToolDefinitionForm
            key={tool?.id || 'new'}
            tool={tool}
            onSave={(savedTool) => {
              onSave(savedTool);
              onOpenChange(false);
            }}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
