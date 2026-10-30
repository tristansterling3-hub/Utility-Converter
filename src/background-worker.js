import { removeBackground } from '@imgly/background-removal';

// Keep model loading and inference off the UI thread. Jobs are sent sequentially.
self.onmessage = async ({ data: { id, blob } }) => {
  try {
    const result = await removeBackground(blob, {
      model: 'isnet_fp16',
      device: 'cpu',
      proxyToWorker: false,
      output: { format: 'image/png', quality: 1 },
      progress: (key, current, total) => {
        self.postMessage({ id, kind: 'progress', key, current, total });
      },
    });
    self.postMessage({ id, kind: 'result', blob: result });
  } catch (error) {
    self.postMessage({ id, kind: 'error', message: error.message || 'Background removal failed.' });
  }
};
