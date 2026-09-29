import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Bot,
  Brain,
  ChevronDown,
  ChevronRight,
  Eraser,
  Loader2,
  Send,
  Square,
  User,
  Sparkles,
} from 'lucide-react';
import type { ChatMessage } from '../types';
import { ToolCallCard } from './ToolCallCard';

interface ClientToolsChatAreaProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onSendMessage: (text: string) => void;
  onSubmitToolResult: (toolCallId: string, toolName: string, result: string) => void;
  onClearChat: () => void;
  onCancelRequest: () => void;
  onApplyPromptPreset: (promptText: string) => void;
}

export function ClientToolsChatArea({
  messages,
  isLoading,
  onSendMessage,
  onSubmitToolResult,
  onClearChat,
  onCancelRequest,
  onApplyPromptPreset,
}: ClientToolsChatAreaProps) {
  const { t } = useTranslation();
  const [inputText, setInputText] = useState('');
  const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (inputText.trim() && !isLoading) {
        onSendMessage(inputText.trim());
        setInputText('');
      }
    }
  };

  const handleSend = () => {
    if (inputText.trim() && !isLoading) {
      onSendMessage(inputText.trim());
      setInputText('');
    }
  };

  const toggleThinking = (messageId: string) => {
    setExpandedThinking((prev) => ({ ...prev, [messageId]: !prev[messageId] }));
  };

  const PRESETS = [
    {
      id: 'weather',
      label: '🌦️ Weather Tool',
      prompt: "What's the weather like in Tokyo right now? Please check it for me.",
    },
    {
      id: 'calc',
      label: '🧮 Math Tool',
      prompt: 'Can you calculate (125 * 84) / 12 + 450 using the calculator tool?',
    },
    {
      id: 'ping',
      label: '⚡ Fast Ping',
      prompt: 'Hello! Please confirm connection with a brief one-sentence reply.',
    },
    {
      id: 'reasoning',
      label: '🧠 Logic Puzzle',
      prompt: 'A farmer has 17 sheep, and all but 9 die. How many are left? Explain your reasoning.',
    },
    {
      id: 'json',
      label: '📊 Extract JSON',
      prompt: "Extract information from: 'Alice is a 28-year-old designer based in Seattle who loves rock climbing.'",
    },
  ];

  return (
    <Card className="flex flex-col h-[700px] border text-xs shadow-sm overflow-hidden">
      {/* Chat Header Toolbar */}
      <div className="flex items-center justify-between border-b px-3 py-2 bg-muted/20">
        <div className="flex items-center gap-2">
          <Bot className="size-4 text-primary" />
          <span className="font-semibold text-xs text-foreground">
            {t('client-tools.chat.canvas-title', 'Client Conversation Canvas')}
          </span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {messages.length} {messages.length === 1 ? 'message' : 'messages'}
          </Badge>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={onClearChat}
            disabled={messages.length === 0 || isLoading}
          >
            <Eraser className="size-3" />
            <span>{t('client-tools.chat.clear', 'Clear')}</span>
          </Button>
        </div>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center text-muted-foreground">
            <div className="rounded-full bg-primary/10 p-3 mb-2 text-primary">
              <Sparkles className="size-6" />
            </div>
            <h3 className="font-semibold text-sm text-foreground">
              {t('client-tools.chat.empty-title', 'Ready for Client API Testing')}
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm mt-1">
              {t(
                'client-tools.chat.empty-desc',
                'Select a model, enable desired functions, and test end-to-end tool calling through the API Proxy Gateway.',
              )}
            </p>

            <div className="mt-4 flex flex-wrap justify-center gap-1.5 max-w-md">
              {PRESETS.map((p) => (
                <Button
                  key={p.id}
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs bg-background hover:bg-accent"
                  onClick={() => onApplyPromptPreset(p.prompt)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            // Find if this is a tool message or has tool calls
            if (msg.role === 'tool') {
              // Usually handled in tool card, or display as subtle event
              return null;
            }

            const isUser = msg.role === 'user';
            const isError = msg.isError;

            // Find tool responses that match assistant tool calls
            const existingToolResponses = new Map<string, string>();
            if (msg.tool_calls) {
              for (const other of messages) {
                if (other.role === 'tool' && other.tool_call_id) {
                  existingToolResponses.set(other.tool_call_id, other.content);
                }
              }
            }

            return (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/20">
                    <Bot className="size-4" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-lg p-3 text-xs shadow-sm ${
                    isUser
                      ? 'bg-primary text-primary-foreground ml-auto'
                      : isError
                        ? 'border border-destructive/40 bg-destructive/10 text-destructive'
                        : 'border border-border/80 bg-card text-foreground'
                  }`}
                >
                  {/* Thinking Block */}
                  {msg.thinking && (
                    <div className="mb-2 rounded border border-purple-500/30 bg-purple-500/5 text-purple-900 dark:text-purple-300">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between p-2 text-left text-[11px] font-medium"
                        onClick={() => toggleThinking(msg.id)}
                      >
                        <div className="flex items-center gap-1.5">
                          <Brain className="size-3.5 text-purple-500" />
                          <span>{t('client-tools.chat.reasoning-process', 'Model Reasoning Process')}</span>
                        </div>
                        {expandedThinking[msg.id] ? (
                          <ChevronDown className="size-3.5" />
                        ) : (
                          <ChevronRight className="size-3.5" />
                        )}
                      </button>
                      {expandedThinking[msg.id] && (
                        <div className="border-t border-purple-500/20 p-2 font-mono text-[10px] whitespace-pre-wrap leading-relaxed max-h-48 overflow-auto">
                          {msg.thinking}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Main text content */}
                  {msg.content && (
                    <div className="whitespace-pre-wrap leading-relaxed select-text font-sans">
                      {msg.content}
                    </div>
                  )}

                  {/* Tool Call Cards */}
                  {msg.tool_calls && msg.tool_calls.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {msg.tool_calls.map((tc) => (
                        <ToolCallCard
                          key={tc.id}
                          toolCall={tc}
                          existingResult={existingToolResponses.get(tc.id)}
                          isSubmitting={isLoading}
                          onSubmitResult={onSubmitToolResult}
                        />
                      ))}
                    </div>
                  )}

                  {/* Timestamp */}
                  <div
                    className={`mt-1 text-[9px] text-right ${
                      isUser ? 'text-primary-foreground/70' : 'text-muted-foreground'
                    }`}
                  >
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </div>
                </div>

                {isUser && (
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground border">
                    <User className="size-4" />
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground text-xs pl-9">
            <Loader2 className="size-3.5 animate-spin text-primary" />
            <span className="italic">{t('client-tools.chat.streaming', 'Proxy gateway is streaming response...')}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompt Presets Bar */}
      {messages.length > 0 && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 border-t bg-muted/10 overflow-x-auto">
          <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap">
            {t('client-tools.chat.presets', 'Quick Tests:')}
          </span>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="rounded-full border border-border/70 bg-background px-2 py-0.5 text-[10px] hover:bg-accent hover:text-accent-foreground whitespace-nowrap transition-colors"
              onClick={() => onApplyPromptPreset(p.prompt)}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Input Area */}
      <div className="border-t p-3 bg-muted/20">
        <div className="relative flex items-end gap-2">
          <textarea
            rows={2}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t(
              'client-tools.chat.input-placeholder',
              'Enter prompt (e.g. "What is the weather in Paris?" to test functions)...',
            )}
            className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex w-full resize-none rounded-md border p-2 text-xs focus-visible:ring-2 focus-visible:outline-none"
          />

          {isLoading ? (
            <Button
              size="sm"
              variant="destructive"
              className="h-10 px-3 gap-1 shrink-0"
              onClick={onCancelRequest}
            >
              <Square className="size-3.5 fill-current" />
              <span>{t('common.cancel', 'Stop')}</span>
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-10 px-3 gap-1 shrink-0"
              onClick={handleSend}
              disabled={!inputText.trim()}
            >
              <Send className="size-3.5" />
              <span>{t('client-tools.chat.send', 'Send')}</span>
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
