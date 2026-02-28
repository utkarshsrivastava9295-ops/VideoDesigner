/**
 * Downloads the AnimeGAN model (best offline option for anime conversion) into
 * public/models/animegan/. The app will use this when available for faster
 * load and offline use. Also run by: npm run download-models (downloads all models).
 */
import https from 'https'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '..', 'public', 'models', 'animegan')
const BASE = 'https://cdn.jsdelivr.net/gh/TonyLianLong/AnimeGAN.js@master/public/model_full'

const FILES = [
  'model.json',
  'group1-shard1of4.bin',
  'group1-shard2of4.bin',
  'group1-shard3of4.bin',
  'group1-shard4of4.bin',
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
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true })
  }
  for (const file of FILES) {
    const url = `${BASE}/${file}`
    const outPath = path.join(OUT_DIR, file)
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
  console.log('Done. AnimeGAN model is in public/models/animegan/')
}

main()
