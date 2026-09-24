import fastifyMultipart from '@fastify/multipart';
import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { parseAudioMultipartRequest } from '@/modules/proxy-gateway/server/modules/openai/media/audio-multipart-request';

const servers: Array<ReturnType<typeof Fastify>> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe('parseAudioMultipartRequest', () => {
  it('parses a real OpenAI multipart audio upload', async () => {
    const server = Fastify();
    servers.push(server);
    await server.register(fastifyMultipart);
    server.post('/v1/audio/transcriptions', async (request) => parseAudioMultipartRequest(request));

    const boundary = '----antigravity-audio';
    const payload = Buffer.from(
      [
        `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\ngemini-3-flash`,
        `--${boundary}\r\nContent-Disposition: form-data; name="prompt"\r\n\r\nPreserve product names`,
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="sample.wav"\r\nContent-Type: audio/wav\r\n\r\nAUDIO-BYTES`,
        `--${boundary}--\r\n`,
      ].join('\r\n'),
    );

    const response = await server.inject({
      method: 'POST',
      url: '/v1/audio/transcriptions',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      model: 'gemini-3-flash',
      prompt: 'Preserve product names',
      file: {
        data: Buffer.from('AUDIO-BYTES').toString('base64'),
        mimeType: 'audio/wav',
      },
    });
  });

  it('rejects non-multipart requests', async () => {
    const server = Fastify();
    servers.push(server);
    await server.register(fastifyMultipart);
    server.post('/v1/audio/transcriptions', async (request, reply) => {
      try {
        return await parseAudioMultipartRequest(request);
      } catch (error) {
        return reply
          .status(400)
          .send(error instanceof Error ? error.message : 'Invalid multipart request');
      }
    });

    const response = await server.inject({
      method: 'POST',
      url: '/v1/audio/transcriptions',
      payload: { file: 'not-wire-compatible' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).toBe('Expected a multipart/form-data request');
  });
});
