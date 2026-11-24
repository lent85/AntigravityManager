import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  mergeOpenAIResponsesInputItems,
  OpenAIResponsesSessionStore,
  OpenAIResponsesSessionStoreImpl,
} from '@/modules/proxy-gateway/server/modules/openai/responses/openai-responses-session.store';

describe('OpenAIResponsesSessionStore', () => {
  it('preserves long tool arguments exactly within the history budget', () => {
    const argumentsText = JSON.stringify({ content: 'x'.repeat(150_000) });
    const item = {
      type: 'function_call',
      call_id: 'call_long',
      name: 'write_file',
      arguments: argumentsText,
    };
    OpenAIResponsesSessionStore.save('long_tool', { model: 'fixture-model', inputItems: [item] });
    expect(OpenAIResponsesSessionStore.get('long_tool')?.inputItems).toEqual([item]);
  });

  it.each(['save', 'delta'] as const)(
    'bounds UTF-8 history bytes for root %s without publishing the record',
    (mode) => {
      const store = new OpenAIResponsesSessionStoreImpl();
      const inputItems = Array.from({ length: 20 }, () => ({
        type: 'message',
        role: 'user',
        content: '界'.repeat(80_000),
      }));
      const write = () =>
        mode === 'save'
          ? store.save('oversized', { model: 'fixture-model', inputItems })
          : store.saveDelta('oversized', {
              model: 'fixture-model',
              inputDelta: inputItems,
              responseOutput: [],
            });
      expect(write).toThrow('maximum byte limit');
      expect(store.get('oversized')).toBeNull();
    },
  );

  it('includes retained response and instructions in the byte ceiling', () => {
    expect(() =>
      OpenAIResponsesSessionStore.save('oversized_metadata', {
        model: 'fixture-model',
        inputItems: [],
        instructions: 'x'.repeat(4 * 1024 * 1024),
      }),
    ).toThrow('maximum byte limit');
    expect(OpenAIResponsesSessionStore.get('oversized_metadata')).toBeNull();
  });
  afterEach(() => {
    OpenAIResponsesSessionStore.clear();
    vi.useRealTimers();
  });

  it('expires continuation history after one hour', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T00:00:00.000Z'));
    OpenAIResponsesSessionStore.save('resp_expiring', {
      inputItems: [{ type: 'message', role: 'user' }],
      model: 'gpt-4o',
    });

    vi.advanceTimersByTime(60 * 60 * 1000);

    expect(OpenAIResponsesSessionStore.get('resp_expiring')).toBeNull();
  });

  it('keeps recently accessed sessions when capacity eviction runs', () => {
    for (let index = 0; index < 500; index += 1) {
      OpenAIResponsesSessionStore.save(`resp_${index}`, {
        inputItems: [{ type: 'message', role: 'user', content: `${index}` }],
        model: 'gpt-4o',
      });
    }

    expect(OpenAIResponsesSessionStore.get('resp_0')).not.toBeNull();

    OpenAIResponsesSessionStore.save('resp_500', {
      inputItems: [{ type: 'message', role: 'user', content: 'new' }],
      model: 'gpt-4o',
    });

    expect(OpenAIResponsesSessionStore.get('resp_0')).not.toBeNull();
    expect(OpenAIResponsesSessionStore.get('resp_1')).toBeNull();
    expect(OpenAIResponsesSessionStore.get('resp_500')).not.toBeNull();
  });

  it('removes transcript-only reasoning while retaining final answers and tool calls', () => {
    const merged = mergeOpenAIResponsesInputItems(
      [
        {
          content: [{ text: 'Inspecting files', type: 'output_text' }],
          id: 'msg_thought_resp_1',
          phase: 'commentary',
          role: 'assistant',
          type: 'message',
        },
        {
          id: 'rs_resp_1',
          status: 'completed',
          summary: [{ text: 'Inspecting files', type: 'summary_text' }],
          type: 'reasoning',
        },
        {
          content: [{ text: 'Final result', type: 'output_text' }],
          id: 'msg_final_resp_1',
          phase: 'final_answer',
          role: 'assistant',
          type: 'message',
        },
        {
          arguments: '{}',
          call_id: 'call_1',
          id: 'item_call_1',
          name: 'search_docs',
          type: 'function_call',
        },
      ],
      [{ content: 'Continue', role: 'user', type: 'message' }],
    );

    expect(merged).toEqual([
      expect.objectContaining({ id: 'msg_final_resp_1' }),
      expect.objectContaining({ call_id: 'call_1' }),
      expect.objectContaining({ role: 'user' }),
    ]);
  });

  it('removes legacy visible thinking transcripts by their text prefix', () => {
    expect(
      mergeOpenAIResponsesInputItems(
        [
          {
            content: [{ text: '**Thinking**\nInspecting files', type: 'output_text' }],
            id: 'legacy_reasoning',
            role: 'assistant',
            type: 'message',
          },
        ],
        [],
      ),
    ).toEqual([]);
  });

  it('retains native reasoning on the stored response but excludes it from continuation history', () => {
    const response = {
      id: 'resp_reasoning',
      output: [
        {
          id: 'rs_resp_reasoning',
          status: 'completed',
          summary: [{ text: 'Inspecting files', type: 'summary_text' }],
          type: 'reasoning',
        },
        {
          content: [{ text: 'Final result', type: 'output_text' }],
          id: 'msg_resp_reasoning',
          role: 'assistant',
          status: 'completed',
          type: 'message',
        },
      ],
    };
    OpenAIResponsesSessionStore.saveDelta('resp_reasoning', {
      inputDelta: [{ content: 'Start', id: 'msg_start', role: 'user', type: 'message' }],
      model: 'gpt-4o',
      response,
      responseOutput: response.output,
    });

    const session = OpenAIResponsesSessionStore.get('resp_reasoning');
    expect(session?.response).toEqual(response);
    expect(
      mergeOpenAIResponsesInputItems(session?.inputItems ?? [], [
        { content: 'Continue', id: 'msg_continue', role: 'user', type: 'message' },
      ]),
    ).toEqual([
      { content: 'Start', id: 'msg_start', role: 'user', type: 'message' },
      expect.objectContaining({ id: 'msg_resp_reasoning', type: 'message' }),
      { content: 'Continue', id: 'msg_continue', role: 'user', type: 'message' },
    ]);
  });

  it('never retains raw inline media in durable continuation history', () => {
    const inputItems = [
      {
        type: 'function_call_output',
        call_id: 'call_image',
        output: [{ type: 'input_image', image_url: 'data:image/png;base64,AQ==' }],
      },
    ];

    OpenAIResponsesSessionStore.save('resp_image', {
      inputItems,
      model: 'gpt-4o',
    });

    expect(OpenAIResponsesSessionStore.get('resp_image')?.inputItems).toEqual([
      {
        type: 'function_call_output',
        call_id: 'call_image',
        output: [{ type: 'input_text', text: '[historical image omitted]' }],
      },
    ]);
    expect(JSON.stringify(inputItems)).toContain('data:image/');
  });
});
