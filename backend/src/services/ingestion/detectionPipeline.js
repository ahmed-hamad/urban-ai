// AI Detection Pipeline — Integration Stub
//
// Architecture (when implemented):
//   Backend API → This Service → Message Queue → AI Microservice → Inference
//                                                                 → detection_candidates (DB)
//                                                                 → Human Review Queue
//
// YOLO must:
//   - generate detection_candidates only
//   - never directly create reports
//   - always require human validation before a report is created
//
// Future integration points:
//   - YOLO v8/v9 via Python FastAPI microservice
//   - Video frame extraction via ffmpeg
//   - Drone image batch processing
//   - Multi-model ensemble with confidence aggregation
//   - Per-entity confidence threshold configuration
//   - Model fine-tuning pipeline

export const PIPELINE_STATUS = Object.freeze({
  NOT_CONFIGURED: 'not_configured',
  QUEUED:         'queued',
  PROCESSING:     'processing',
  COMPLETED:      'completed',
  FAILED:         'failed',
})

/**
 * Submit a media ingestion record for AI detection.
 * Returns immediately with a job reference — inference is async.
 *
 * When the inference worker completes, it must:
 *   1. INSERT detection_candidates with detection_source='yolo', detection_confidence=<score>
 *   2. UPDATE media_ingestions SET processing_status='processed'
 *   3. Notify the review queue so human reviewers are alerted
 *
 * No fake detections are ever generated here.
 */
export async function submitForDetection(mediaIngestionId, options = {}) {
  const { model = 'yolov8n', confidenceThreshold = 0.5, entityId } = options

  // TODO: Push to message queue (Bull / RabbitMQ)
  //   payload = { mediaIngestionId, model, confidenceThreshold, entityId }
  //   worker fetches media file → runs inference → inserts candidates

  return {
    status:         PIPELINE_STATUS.NOT_CONFIGURED,
    message:        'AI detection pipeline not yet configured. All candidates require manual review.',
    mediaIngestionId,
    queueJobId:     null,
  }
}

/**
 * Poll the status of an inference job.
 */
export async function getDetectionStatus(queueJobId) {
  // TODO: Query Bull/RabbitMQ job status
  return { status: PIPELINE_STATUS.NOT_CONFIGURED, candidateCount: 0, queueJobId }
}

/**
 * Extract frames from an uploaded video for batch inference.
 * Each extracted frame becomes a new media_ingestion with file_type='image'
 * and a parent_media_ingestion_id reference to the original video.
 */
export async function extractVideoFrames(mediaIngestionId, options = {}) {
  const { intervalSeconds = 2, maxFrames = 100 } = options

  // TODO: Implement using fluent-ffmpeg or child_process ffmpeg invocation
  //   ffmpeg -i <input> -vf fps=1/<intervalSeconds> -frames:v <maxFrames> frame_%04d.jpg

  return {
    status:          PIPELINE_STATUS.NOT_CONFIGURED,
    message:         'Video frame extraction not yet configured.',
    mediaIngestionId,
    frameCount:      0,
    framePaths:      [],
  }
}
