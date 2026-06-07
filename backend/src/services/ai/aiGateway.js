// AI Vision Gateway — selects the active vision provider at runtime.
//
// Supported providers (set AI_VISION_PROVIDER in .env):
//   claude_vision  — Anthropic Claude Vision API (default)
//   yolo           — Python FastAPI microservice with YOLOv8 ONNX (Phase 2)
//
// All providers implement the same interface:
//   detect(filePath, mimeType, options) → Promise<Detection[]>
//
// Detection shape (provider contract):
//   { element_type, label, confidence, bbox, notes }
//
// Workflow governance (enforced here):
//   - Gateway NEVER creates candidates or reports — it only returns raw detections
//   - All detections pass through elementMappingService before DB insertion
//   - Provider selection is a runtime config concern, not a code concern

import * as claudeVision from './providers/claudeVisionProvider.js'
import * as yolo          from './providers/yoloProvider.js'

const PROVIDERS = {
  [claudeVision.PROVIDER_ID]: claudeVision,
  [yolo.PROVIDER_ID]:         yolo,
}

export function getActiveProviderKey() {
  return process.env.AI_VISION_PROVIDER ?? 'claude_vision'
}

export function getActiveModel() {
  const p = PROVIDERS[getActiveProviderKey()]
  return p?.model ?? 'unknown'
}

// Detects violations in a single image file.
// Returns [] on no detections.
// Throws with { code } on configuration / provider errors.
export async function detectViolations(filePath, mimeType, options = {}) {
  const key = getActiveProviderKey()
  const provider = PROVIDERS[key]
  if (!provider) {
    throw Object.assign(
      new Error(`Unknown AI vision provider: "${key}". Set AI_VISION_PROVIDER to one of: ${Object.keys(PROVIDERS).join(', ')}`),
      { code: 'UNKNOWN_PROVIDER' },
    )
  }
  return provider.detect(filePath, mimeType, options)
}
