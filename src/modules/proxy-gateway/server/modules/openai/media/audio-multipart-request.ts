import type { FastifyRequest } from 'fastify';

import type { AudioRequestBody } from '../openai-operations.service';

/** Parses the OpenAI audio multipart wire format at the Fastify boundary. */
export async function parseAudioMultipartRequest(
  request: FastifyRequest,
): Promise<AudioRequestBody> {
  if (!request.isMultipart()) {
    throw new Error('Expected a multipart/form-data request');
  }

  const body: AudioRequestBody = {};
  let foundAudio = false;
  for await (const part of request.parts({ limits: { files: 1 } })) {
    if (part.type === 'file') {
      if (part.fieldname !== 'file' && part.fieldname !== 'audio') {
        part.file.resume();
        continue;
      }
      if (foundAudio) {
        part.file.resume();
        throw new Error("Only one 'file' audio upload is supported.");
      }
      const data = await part.toBuffer();
      body.file = {
        data: data.toString('base64'),
        mimeType: part.mimetype || 'audio/mpeg',
      };
      foundAudio = true;
      continue;
    }

    const value = String(part.value ?? '');
    if (part.fieldname === 'model' && value) {
      body.model = value;
    } else if (part.fieldname === 'prompt') {
      body.prompt = value;
    }
  }

  return body;
}
