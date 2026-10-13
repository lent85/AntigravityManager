import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import type { ModelPricingConfig } from '@/modules/config/types';
import type { ServiceConfigSnapshot } from '@/modules/config/service-config.schema';
type ProxyConfig = ServiceConfigSnapshot['proxy'];
import type { ProxyExampleModel } from './proxy-example-models';
import { DollarSign, Terminal } from 'lucide-react';

interface ProxyGatewayPricingTabProps {
  proxyConfig: ProxyConfig;
  updateProxyConfig: (newConfig: ProxyConfig) => Promise<void>;
  models: readonly ProxyExampleModel[];
  baseUrl: string;
}

export function ProxyGatewayPricingTab({
  proxyConfig,
  updateProxyConfig,
  models,
  baseUrl,
}: ProxyGatewayPricingTabProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [pricingState, setPricingState] = useState<Record<string, ModelPricingConfig>>(
    proxyConfig.model_pricing || {},
  );
  const [isSaving, setIsSaving] = useState(false);

  const handlePriceChange = (modelId: string, field: keyof ModelPricingConfig, value: string) => {
    const numValue = value === '' ? undefined : Number(value);
    setPricingState((prev) => ({
      ...prev,
      [modelId]: {
        ...prev[modelId],
        [field]: numValue,
      },
    }));
  };

  const savePricing = async () => {
    setIsSaving(true);
    try {
      await updateProxyConfig({
        ...proxyConfig,
        model_pricing: pricingState,
      });
      toast({ title: t('proxy.pricing.saved', 'Pricing configuration saved successfully!') });
    } catch {
      toast({
        title: t('proxy.error', 'Error'),
        description: 'Failed to save pricing configuration',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const getPricing = (modelId: string): ModelPricingConfig => {
    return pricingState[modelId] ?? {};
  };

  return (
    <div className="space-y-3">
      {/* Model Pricing Configuration Table */}
      <Card>
        <CardHeader className="bg-muted/20 border-b px-4 py-2.5">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="text-primary size-4" />
              <CardTitle className="text-sm font-semibold">
                {t('proxy.pricing.title', 'Model Pricing & Quote Configuration')}
              </CardTitle>
            </div>
            <Button
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={savePricing}
              disabled={isSaving}
            >
              {isSaving
                ? t('proxy.saving', 'Saving...')
                : t('proxy.pricing.save_button', 'Save Pricing')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-4">
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 text-muted-foreground text-[11px] font-semibold uppercase">
                <tr>
                  <th className="px-3 py-2">Model</th>
                  <th className="px-3 py-2">Prompt ($ / 1M Tokens)</th>
                  <th className="px-3 py-2">Completion ($ / 1M Tokens)</th>
                  <th className="px-3 py-2">Per-Request Fee ($)</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {models.map((model) => {
                  const currentPrice = getPricing(model.id);

                  return (
                    <tr key={model.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <div className="text-foreground font-medium">{model.name}</div>
                        <code className="text-muted-foreground text-[10px]">{model.id}</code>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">$</span>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            className="h-7 w-24 font-mono text-xs"
                            value={currentPrice.prompt_price_per_m ?? ''}
                            placeholder="0.00"
                            onChange={(e) =>
                              handlePriceChange(model.id, 'prompt_price_per_m', e.target.value)
                            }
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">$</span>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            className="h-7 w-24 font-mono text-xs"
                            value={currentPrice.completion_price_per_m ?? ''}
                            placeholder="0.00"
                            onChange={(e) =>
                              handlePriceChange(model.id, 'completion_price_per_m', e.target.value)
                            }
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">$</span>
                          <Input
                            type="number"
                            step="0.001"
                            min="0"
                            className="h-7 w-24 font-mono text-xs"
                            value={currentPrice.request_price ?? ''}
                            placeholder="0.00"
                            onChange={(e) =>
                              handlePriceChange(model.id, 'request_price', e.target.value)
                            }
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Quote & Quota API Explorer */}
      <Card>
        <CardHeader className="bg-muted/20 border-b px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Terminal className="text-primary size-4" />
            <CardTitle className="text-sm font-semibold">
              {t('proxy.pricing.api_explorer_title', 'AI Gateway Quote & Quota Endpoints')}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-2.5 p-3 sm:p-4">
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
            <div className="space-y-1.5 rounded-md border p-2.5">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold">Quote Models & Pricing API</div>
                <span className="py-0.2 rounded bg-blue-500/10 px-1.5 font-mono text-[9px] font-bold text-blue-500">
                  GET
                </span>
              </div>
              <p className="text-muted-foreground text-[11px]">
                Returns active model list along with context window limits, pricing, and quota
                percentage.
              </p>
              <pre className="bg-muted/50 text-foreground overflow-x-auto rounded p-2 font-mono text-[11px]">
                curl {baseUrl}/v1/models/quote -H "Authorization: Bearer{' '}
                {proxyConfig.api_keys?.[0]?.key || 'YOUR_KEY'}"
              </pre>
            </div>

            <div className="space-y-1.5 rounded-md border p-2.5">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold">Aggregated Quota Summary API</div>
                <span className="py-0.2 rounded bg-emerald-500/10 px-1.5 font-mono text-[9px] font-bold text-emerald-500">
                  GET
                </span>
              </div>
              <p className="text-muted-foreground text-[11px]">
                Returns real-time quota remaining across models and accounts for load balancers.
              </p>
              <pre className="bg-muted/50 text-foreground overflow-x-auto rounded p-2 font-mono text-[11px]">
                curl {baseUrl}/v1/gateway/quota -H "Authorization: Bearer{' '}
                {proxyConfig.api_keys?.[0]?.key || 'YOUR_KEY'}"
              </pre>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
