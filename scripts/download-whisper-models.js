/**
 * Downloads Whisper Large V3 model for local lyric extraction.
 * Saves to public/models/whisper-large-v3/
 * Run: node scripts/download-whisper-models.js
 * Or: npm run download-whisper
 *
 * Used by transformers.js / @huggingface/transformers for offline lyric extraction.
 */
import https from 'https'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '..', 'public', 'models', 'whisper-large-v3')
const BASE = 'https://huggingface.co/Xenova/whisper-large-v3/resolve/main'

const FILES = [
  'config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'vocab.json',
  'merges.txt',
  'generation_config.json',
  'special_tokens_map.json',
  'added_tokens.json',
  'quantize_config.json',
]

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
        const loc = res.headers.location
        if (loc) {
          const next = loc.startsWith('http') ? loc : new URL(loc, url).href
          return download(next).then(resolve, reject)
        }
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

/** Check if buffer is an LFS pointer (we need the real file, not the pointer) */
function isLfsPointer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 100) return false
  const head = buf.slice(0, 80).toString('utf8')
  return head.startsWith('version https://git-lfs.github.com/spec/v1')
}

async function downloadOnnx() {
  const onnxDir = path.join(OUT_DIR, 'onnx')
  if (!fs.existsSync(onnxDir)) {
    fs.mkdirSync(onnxDir, { recursive: true })
  }
  // Standard ONNX (require .onnx_data for full model). If download fails or gives LFS pointers,
  // the app will fall back to fetching from HuggingFace on first use.
  const onnxFiles = [
    'encoder_model.onnx',
    'decoder_model_merged.onnx',
  ]
  for (const file of onnxFiles) {
    const url = `${BASE}/onnx/${file}`
    const outPath = path.join(onnxDir, file)
    if (fs.existsSync(outPath)) {
      const stat = fs.statSync(outPath)
      const content = fs.readFileSync(outPath, { encoding: 'utf8', end: 100 })
      if (stat.size > 100_000 && !content.startsWith('version https://git-lfs')) {
        console.log(`Skip (exists): onnx/${file}`)
        continue
      }
      if (content.startsWith('version https://git-lfs')) {
        console.log(`Re-downloading (existing file is LFS pointer): onnx/${file}`)
      }
      fs.unlinkSync(outPath)
    }
    console.log(`Downloading onnx/${file} ... (~600MB–900MB, may take several minutes)`)
    try {
      const buf = await download(url)
      if (isLfsPointer(buf)) {
        console.warn(`  Got LFS pointer instead of file. Install huggingface_hub and run:`)
        console.warn(`  huggingface-cli download Xenova/whisper-large-v3 onnx/${file} --local-dir ${OUT_DIR}`)
        continue
      }
      fs.writeFileSync(outPath, buf)
      console.log(`  -> ${outPath} (${(buf.length / 1024 / 1024).toFixed(1)} MB)`)
    } catch (err) {
      console.warn(`  Failed: ${err.message}`)
      console.warn(`  You can skip this - the app will download from HuggingFace on first use.`)
    }
  }
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true })
  }

  for (const file of FILES) {
    const url = `${BASE}/${file}`
    const outPath = path.join(OUT_DIR, file)
    if (fs.existsSync(outPath)) {
      console.log(`Skip (exists): ${file}`)
      continue
    }
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

  await downloadOnnx()

  console.log('Done. Whisper Large V3 model is in public/models/whisper-large-v3/')
  console.log('')
  console.log('If you get "protobuf parsing failed" or "Failed to load model":')
  console.log('  - The ONNX files may be LFS pointers (run: huggingface-cli download Xenova/whisper-large-v3)')
  console.log('  - Or skip npm run download-whisper – the app will download from HuggingFace on first use.')
}

main()
