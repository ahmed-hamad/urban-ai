// YOLO Provider — stub for future Python microservice integration.
//
// When AI_VISION_PROVIDER=yolo, the gateway routes here.
// This provider calls the Python FastAPI service at AI_SERVICE_URL.
//
// Architecture (Phase 2):
//   Express Backend → POST http://ai-service:8001/detect → FastAPI + YOLOv8 ONNX
//
// YOLO labels differ from Claude Vision labels and MUST pass through
// element_detection_mapping before creating detection candidates.
//
// Example YOLO → UrbanAI mapping (Phase 2 seed data):
//   'pothole'               → 'street_excavation'
//   'graffiti'              → 'wall_graffiti'
//   'garbage_pile'          → 'waste_containers'
//   'construction_debris'   → 'construction_waste'
//   'abandoned_car'         → 'abandoned_vehicles'

export const PROVIDER_ID = 'yolo'

export async function detect(_filePath, _mimeType, _options = {}) {
  const serviceUrl = process.env.AI_SERVICE_URL
  if (!serviceUrl) {
    throw Object.assign(
      new Error('AI_SERVICE_URL غير مضبوط — خدمة YOLO غير متاحة'),
      { code: 'NOT_CONFIGURED' },
    )
  }

  // Phase 2: call FastAPI inference endpoint
  // const form = new FormData()
  // form.append('image', await readFile(filePath), { filename: path.basename(filePath), contentType: mimeType })
  // const response = await fetch(`${serviceUrl}/detect`, { method: 'POST', body: form })
  // const data = await response.json()
  // return data.detections  // [{ element_type, label, confidence, bbox, notes }]

  throw Object.assign(
    new Error('YOLO provider not yet implemented — run Python ai-service first'),
    { code: 'NOT_IMPLEMENTED' },
  )
}

export const model = 'yolov8n'
