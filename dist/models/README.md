# Face detection models (for "Face nod" animation)

To use the **Face nod (AI)** option, the **SSD MobileNet V1** face detection model files must be in this folder. This model is more accurate than the tiny detector and gives a proper reel-style nod (head tilt + subtle motion).

## Quick setup (recommended)

From the project root run:

```bash
npm run download-models
```

This downloads the required files from the face-api.js weights CDN into `public/models/`.

## Required files (SSD MobileNet V1)

- `ssd_mobilenetv1_model-weights_manifest.json`
- `ssd_mobilenetv1_model-shard1`
- `ssd_mobilenetv1_model-shard2`

## Manual setup

If the script fails, download the files manually from the [face-api.js weights](https://github.com/justadudewhohacks/face-api.js/tree/master/weights) or [jsDelivr CDN](https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights/) and place them in this `public/models/` folder.

If these files are missing, the Face nod option will be skipped (no error; the rest of the app works normally).
