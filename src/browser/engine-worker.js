import { inspect, processPdf, imagesToPdf, rasterPdf } from '../engines.js';
self.onmessage = async ({ data }) => {
  try {
    const result = await ({ inspect, processPdf, imagesToPdf, rasterPdf })[data.method](data.args);
    self.postMessage({ result });
  } catch (error) { self.postMessage({ error: error.message }); }
};
