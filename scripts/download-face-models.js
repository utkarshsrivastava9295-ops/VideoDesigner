/**
 * Downloads face detection model files into public/models/
 * for the "Face nod (AI)" feature. Uses SSD MobileNet V1 (more accurate).
 * npm run download-models runs this and the AnimeGAN download for full offline use.
 */
import https from 'https'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MODELS_DIR = path.join(__dirname, '..', 'public', 'models')
const BASE = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights'

const FILES = [
  'ssd_mobilenetv1_model-weights_manifest.json',
  'ssd_mobilenetv1_model-shard1',
  'ssd_mobilenetv1_model-shard2',
]

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        return download(res.headers.location).then(resolve, reject)
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${url}`))
        return
      }
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject)
  })
}

async function main() {
  if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true })
  }
  for (const file of FILES) {
    const url = `${BASE}/${file}`
    const outPath = path.join(MODELS_DIR, file)
    console.log(`Downloading ${file} ...`)
    try {
      const buf = await download(url)
      fs.writeFileSync(outPath, buf)
      console.log(`  -> ${outPath}`)
    } catch (err) {
      console.error(`  Failed: ${err.message}`)
      process.exit(1)
    }
  }
  console.log('Done. Face detection models are in public/models/')
}

main()
