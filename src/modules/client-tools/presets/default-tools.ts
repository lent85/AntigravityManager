import type { ToolDefinition } from '../types';

export const DEFAULT_PRESET_TOOLS: ToolDefinition[] = [
  {
    id: 'weather',
    enabled: true,
    name: 'get_current_weather',
    description: 'Get the current weather conditions for a given geographic location.',
    parametersJson: JSON.stringify(
      {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'The city and state or country, e.g. "Tokyo, Japan" or "San Francisco, CA"',
          },
          unit: {
            type: 'string',
            enum: ['celsius', 'fahrenheit'],
            description: 'Temperature unit preference',
          },
        },
        required: ['location'],
      },
      null,
      2,
    ),
  },
  {
    id: 'calculator',
    enabled: true,
    name: 'calculator',
    description: 'Evaluate a mathematical expression safely.',
    parametersJson: JSON.stringify(
      {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description: 'The math expression to calculate, e.g. "15 * 85 / 100 + 42"',
          },
        },
        required: ['expression'],
      },
      null,
      2,
    ),
  },
  {
    id: 'search',
    enabled: false,
    name: 'search_web',
    description: 'Search the live internet for recent articles, documentation, or news.',
    parametersJson: JSON.stringify(
      {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to look up',
          },
          max_results: {
            type: 'number',
            description: 'Maximum number of search results to return (1-10)',
          },
        },
        required: ['query'],
      },
      null,
      2,
    ),
  },
  {
    id: 'time',
    enabled: false,
    name: 'get_current_time',
    description: 'Get current date, time, and timezone offset for a specified timezone.',
    parametersJson: JSON.stringify(
      {
        type: 'object',
        properties: {
          timezone: {
            type: 'string',
            description: 'IANA timezone name, e.g. "America/New_York", "Asia/Tokyo", or "UTC"',
          },
        },
        required: ['timezone'],
      },
      null,
      2,
    ),
  },
];

export function getMockToolResponse(toolName: string, parsedArgs: Record<string, unknown>): string {
  const normalized = toolName.toLowerCase();
  if (normalized.includes('weather')) {
    const loc = String(parsedArgs.location || 'Hanoi');
    const unit = String(parsedArgs.unit || 'celsius');
    return JSON.stringify(
      {
        location: loc,
        temperature: unit === 'fahrenheit' ? 78 : 26,
        unit,
        condition: 'Clear Sky & Sunny',
        humidity: '58%',
        wind_speed: '12 km/h',
        air_quality_index: 45,
      },
      null,
      2,
    );
  }

  if (normalized.includes('calc')) {
    const expr = String(parsedArgs.expression || '0');
    let evaluated: number | string = 0;
    try {
      // Evaluate basic arithmetic safely without eval
      const sanitized = expr.replace(/[^0-9+\-*/(). %]/g, '');
      const func = new Function(`return (${sanitized});`);
      evaluated = Number(func());
    } catch {
      evaluated = 'Computed result: 42';
    }
    return JSON.stringify({ expression: expr, result: evaluated, status: 'success' }, null, 2);
  }

  if (normalized.includes('search')) {
    const q = String(parsedArgs.query || 'AI developments');
    return JSON.stringify(
      {
        query: q,
        results_count: 2,
        results: [
          {
            title: `Latest insights on ${q}`,
            snippet: `Comprehensive overview and recent verified updates regarding ${q}.`,
            url: `https://example.com/search?q=${encodeURIComponent(q)}`,
          },
          {
            title: `Documentation & Reference for ${q}`,
            snippet: `Technical specification and implementation guidelines.`,
            url: `https://docs.example.com/topics/${encodeURIComponent(q)}`,
          },
        ],
      },
      null,
      2,
    );
  }

  if (normalized.includes('time')) {
    const tz = String(parsedArgs.timezone || 'UTC');
    const now = new Date();
    return JSON.stringify(
      {
        timezone: tz,
        iso_timestamp: now.toISOString(),
        formatted_local: now.toLocaleString('en-US', { timeZone: tz }),
      },
      null,
      2,
    );
  }

  return JSON.stringify({ status: 'success', executed_tool: toolName, input: parsedArgs }, null, 2);
}
