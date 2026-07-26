#!/usr/bin/env node
import {
  authHeaders,
  getRestUrl,
  resolveWorkspace,
  truncateValue
} from './agentmemory-lib.mjs';

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  let data;
  try {
    data = JSON.parse(input);
  } catch {
    return;
  }
  const sessionId = data.session_id || 'unknown';
  const { project, cwd } = resolveWorkspace(data);
  const { imageData, cleanOutput } = extractImageData(data.tool_response ?? data.tool_output);
  try {
    await fetch(`${getRestUrl()}/agentmemory/observe`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        hookType: 'post_tool_use',
        sessionId,
        project,
        cwd,
        timestamp: new Date().toISOString(),
        data: {
          tool_name: data.tool_name,
          tool_input: truncateValue(data.tool_input, 4000),
          tool_output: truncateValue(cleanOutput, 8000),
          ...imageData ? { image_data: imageData } : {}
        }
      }),
      signal: AbortSignal.timeout(3000)
    });
  } catch {}
}

function isBase64Image(val) {
  return typeof val === 'string' && (val.startsWith('data:image/') || val.startsWith('iVBORw0KGgo') || val.startsWith('/9j/'));
}

const MAX_IMAGE_DATA_CHARS = 8000;

function boundImageData(imageData) {
  if (!imageData || typeof imageData !== 'string') return undefined;
  if (imageData.length <= MAX_IMAGE_DATA_CHARS) return imageData;
  return undefined;
}

function extractImageData(output) {
  if (isBase64Image(output)) {
    return {
      imageData: boundImageData(output),
      cleanOutput: '[image data extracted]'
    };
  }
  if (typeof output === 'object' && output !== null && !Array.isArray(output)) {
    const obj = output;
    let imageData;
    const clean = {};
    for (const [key, val] of Object.entries(obj)) {
      if (!imageData && isBase64Image(val)) {
        imageData = boundImageData(val);
        clean[key] = '[image data extracted]';
      } else {
        clean[key] = val;
      }
    }
    return {
      imageData,
      cleanOutput: clean
    };
  }
  return {
    imageData: undefined,
    cleanOutput: output
  };
}

main();
