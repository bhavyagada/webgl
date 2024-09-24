import { env, pipeline } from '@xenova/transformers';

env.allowLocalModels = false;

let ready = false;

self.onmessage = async (e) => {
  if (!ready) {
    ready = true;
    self.postMessage({ type: 'ready' });
  }

  const { type, data, imageId } = e.data;
  if (type === 'estimate_depth') {
    self.postMessage({ type: 'depth_result', data: 'start', imageId });
    const depth_estimator = await pipeline('depth-estimation', 'Xenova/depth-anything-large-hf');
    const output = await depth_estimator(data);
    self.postMessage({ type: 'depth_result', data: { depth: output.depth }, imageId });
  } else {
    throw new Error(`Unknown message type: ${type}`);
  }
};