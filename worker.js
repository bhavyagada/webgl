import { env, SamModel, AutoProcessor, RawImage, Tensor } from '@xenova/transformers';

// Since we will download the model from the Hugging Face Hub, we can skip the local model check
env.allowLocalModels = false;

// We adopt the singleton pattern to enable lazy-loading of the model and processor.
export class SegmentAnythingSingleton {
  static model_id = 'Xenova/slimsam-77-uniform';
  static model;
  static processor;
  static quantized = true;

  static getInstance() {
    if (!this.model) {
      this.model = SamModel.from_pretrained(this.model_id, {
          quantized: this.quantized,
      });
    }
    if (!this.processor) {
      this.processor = AutoProcessor.from_pretrained(this.model_id);
    }
    return Promise.all([this.model, this.processor]);
  }
}

// State variables
let state = 'initializing'; // 'initializing', 'ready', 'processing'
let image_embeddings = null;
let image_inputs = null;
let cache = new Map();
let requestQueue = [];

async function processQueue() {
  if (requestQueue.length > 0 && state === 'ready') {
    state = 'processing';
    const request = requestQueue.shift();
    await handleRequest(request);
    state = 'ready';
    processQueue();
  }
}

async function handleRequest(request) {
  const { type, data, id } = request;
  const [model, processor] = await SegmentAnythingSingleton.getInstance();

  if (type === 'segment') {
    if (cache.has(id)) {
      self.postMessage({ type: 'decode_result', data: cache.get(id), id });
      return;
    }
    self.postMessage({ type: 'segment_result', data: 'start', id });
    const image = await RawImage.read(data);
    image_inputs = await processor(image);
    image_embeddings = await model.get_image_embeddings(image_inputs);
    self.postMessage({ type: 'segment_result', data: 'done', id });
  } else if (type === 'decode') {
    if (!image_inputs || !image_embeddings) {
      self.postMessage({ type: 'error', data: 'Image not segmented yet', id });
      return;
    }
    // Prepare inputs for decoding
    const reshaped = image_inputs.reshaped_input_sizes[0];
    const points = data.map(x => [x.point[0] * reshaped[1], x.point[1] * reshaped[0]])
    const labels = data.map(x => BigInt(x.label));

    const input_points = new Tensor('float32', points.flat(Infinity), [1, 1, points.length, 2])
    const input_labels = new Tensor('int64', labels.flat(Infinity), [1, 1, labels.length])

    // Generate the mask
    const outputs = await model({ ...image_embeddings, input_points, input_labels })

    // Post-process the mask
    const masks = await processor.post_process_masks(outputs.pred_masks, image_inputs.original_sizes, image_inputs.reshaped_input_sizes);
    cache.clear();
    cache.set(id, { mask: RawImage.fromTensor(masks[0][0]), scores: outputs.iou_scores.data });
    self.postMessage({ type: 'decode_result', data: { mask: RawImage.fromTensor(masks[0][0]), scores: outputs.iou_scores.data }, id });
  } else {
    self.postMessage({ type: 'error', data: `Unknown message type: ${type}`, id });
  }
}

self.onmessage = async (e) => {
  if (state === 'initializing') {
    await SegmentAnythingSingleton.getInstance();
    state = 'ready';
    self.postMessage({ type: 'ready' });
  }

  requestQueue.push(e.data);
  processQueue();
};
