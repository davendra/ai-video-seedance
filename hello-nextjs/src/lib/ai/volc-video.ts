/**
 * Video Generation API wrapper using Seedance 2.0 via xskill.ai.
 * Supports text-to-video, image-to-video, and omni reference modes.
 * API: https://api.xskill.ai/api/v3/tasks
 */

// Configuration
const XSKILL_API_KEY = process.env.XSKILL_API_KEY;
const XSKILL_BASE_URL = "https://api.xskill.ai";
const XSKILL_CREATE_URL = `${XSKILL_BASE_URL}/api/v3/tasks/create`;
const XSKILL_QUERY_URL = `${XSKILL_BASE_URL}/api/v3/tasks/query`;
const DEFAULT_MODEL = "st-ai/super-seed2";
const DEFAULT_SEEDANCE_MODEL = "seedance_2.0_fast";

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const REQUEST_TIMEOUT_MS = 60000; // 1 minute for API calls

/**
 * Custom error class for Video API errors
 */
export class VolcVideoApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public errorCode?: string
  ) {
    super(message);
    this.name = "VolcVideoApiError";
  }
}

/**
 * Video task status enum
 */
export type VideoTaskStatus = "pending" | "processing" | "completed" | "failed";

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if the API credentials are configured
 */
export function isVolcVideoConfigured(): boolean {
  return !!XSKILL_API_KEY;
}

/**
 * Result of video generation task creation
 */
export interface VideoTaskResult {
  taskId: string;
  status: VideoTaskStatus;
}

/**
 * Result of video task status query
 */
export interface VideoStatusResult {
  taskId: string;
  status: VideoTaskStatus;
  progress?: number;
  videoUrl?: string;
  errorMessage?: string;
}

/**
 * xskill.ai create task response
 */
interface XSkillCreateResponse {
  code: number;
  data?: {
    task_id: string;
    price?: number;
  };
  message?: string;
}

/**
 * xskill.ai query task response
 */
interface XSkillQueryResponse {
  code: number;
  data?: {
    task_id: string;
    status: string;
    output?: {
      video_url?: string;
      content_type?: string;
    };
    progress?: {
      stage?: string;
      message?: string;
    };
    error?: string;
  };
  message?: string;
}

/**
 * Create a video generation task from an image
 * @param imageUrl - URL of the source image
 * @param prompt - Description of the desired video motion
 * @param options - Additional generation options
 * @returns Task ID and initial status
 */
export async function createVideoTask(
  imageUrl: string,
  prompt?: string,
  options: {
    duration?: number;
    ratio?: string;
    watermark?: boolean;
    materials?: Array<{
      type: "image" | "video" | "audio" | "text";
      url?: string;
      content?: string;
    }>;
    characterReferenceUrls?: string[];
  } = {}
): Promise<VideoTaskResult> {
  if (!isVolcVideoConfigured()) {
    throw new VolcVideoApiError("Video generation service is not configured. Please set XSKILL_API_KEY.");
  }

  const duration = options.duration ?? 5;
  const ratio = options.ratio ?? "16:9";

  // Determine function mode based on materials
  const hasVideoMaterials = options.materials?.some((m) => m.type === "video" && m.url);
  const hasExtraImageMaterials = options.materials?.some((m) => m.type === "image" && m.url);
  const hasAudioMaterials = options.materials?.some((m) => m.type === "audio" && m.url);
  const hasCharacterRefs = (options.characterReferenceUrls?.length ?? 0) > 0;

  // Build prompt text, incorporating text materials
  let fullPrompt = prompt ?? "";
  if (options.materials) {
    for (const mat of options.materials) {
      if (mat.type === "text" && mat.content) {
        fullPrompt += "\n" + mat.content;
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let params: any;

  if (hasVideoMaterials || hasExtraImageMaterials || hasAudioMaterials || hasCharacterRefs) {
    // Use omni_reference mode for multi-modal input
    const imageFiles = [imageUrl];
    const videoFiles: string[] = [];
    const audioFiles: string[] = [];

    if (options.materials) {
      for (const mat of options.materials) {
        if (mat.type === "image" && mat.url) {
          imageFiles.push(mat.url);
        } else if (mat.type === "video" && mat.url) {
          videoFiles.push(mat.url);
        } else if (mat.type === "audio" && mat.url) {
          audioFiles.push(mat.url);
        }
      }
    }

    // Append character reference images after scene image + material images
    const charRefStartIndex = imageFiles.length + 1; // 1-indexed for @image_file_N
    if (options.characterReferenceUrls) {
      for (const url of options.characterReferenceUrls) {
        imageFiles.push(url);
      }
    }

    // Build prompt with references
    let refPrompt = `@image_file_1 ${fullPrompt}`;
    if (videoFiles.length > 0) {
      refPrompt = `@image_file_1 按照 @video_file_1 的动作和运镜风格进行表演，${fullPrompt}`;
    }
    if (audioFiles.length > 0) {
      refPrompt += ` 配合 @audio_file_1 的节奏`;
    }

    // Add character consistency instruction referencing the appended images
    if (hasCharacterRefs) {
      const charRefTags = options.characterReferenceUrls!.map(
        (_, i) => `@image_file_${charRefStartIndex + i}`
      ).join("、");
      refPrompt += ` 保持角色与参考图片 ${charRefTags} 中的外观一致`;
    }

    params = {
      model: DEFAULT_SEEDANCE_MODEL,
      prompt: refPrompt,
      functionMode: "omni_reference",
      image_files: imageFiles,
      ...(videoFiles.length > 0 ? { video_files: videoFiles } : {}),
      ...(audioFiles.length > 0 ? { audio_files: audioFiles } : {}),
      ratio,
      duration,
    };
  } else {
    // Use first_last_frames mode for simple image-to-video
    params = {
      model: DEFAULT_SEEDANCE_MODEL,
      prompt: fullPrompt,
      functionMode: "first_last_frames",
      filePaths: [imageUrl],
      ratio,
      duration,
    };
  }

  const requestBody = {
    model: DEFAULT_MODEL,
    params,
    channel: null,
  };

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(XSKILL_CREATE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${XSKILL_API_KEY}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const data: XSkillCreateResponse = await response.json();

      if (data.code !== 200 || !data.data?.task_id) {
        throw new VolcVideoApiError(
          data.message || `API error: code ${data.code}`,
          response.status
        );
      }

      return {
        taskId: data.data.task_id,
        status: "pending",
      };
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error instanceof Error ? error : new Error("Unknown error");

      if (error instanceof VolcVideoApiError && error.statusCode === 401) {
        throw error;
      }

      if ((error as Error).name === "AbortError") {
        throw new VolcVideoApiError("Request timed out");
      }

      if (attempt < MAX_RETRIES) {
        console.warn(`xskill.ai create task attempt ${attempt} failed, retrying...`, error);
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }

  throw new VolcVideoApiError(
    `Failed after ${MAX_RETRIES} attempts: ${lastError?.message}`
  );
}

/**
 * Query the status of a video generation task
 * @param taskId - The task ID to query
 * @returns Current status and video URL (if completed)
 */
export async function getVideoTaskStatus(taskId: string): Promise<VideoStatusResult> {
  if (!isVolcVideoConfigured()) {
    throw new VolcVideoApiError("Video generation service is not configured. Please set XSKILL_API_KEY.");
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      // xskill.ai uses POST for task query
      const response = await fetch(XSKILL_QUERY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${XSKILL_API_KEY}`,
        },
        body: JSON.stringify({ task_id: taskId }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const data: XSkillQueryResponse = await response.json();

      if (data.code !== 200 || !data.data) {
        throw new VolcVideoApiError(
          data.message || `API error: code ${data.code}`,
          response.status
        );
      }

      const taskData = data.data;

      // Map status
      let status: VideoTaskStatus = "pending";
      if (taskData.status === "processing" || taskData.status === "running") {
        status = "processing";
      } else if (taskData.status === "completed" || taskData.status === "succeeded") {
        status = "completed";
      } else if (taskData.status === "failed") {
        status = "failed";
      }

      // Video URL comes in output.video_url
      const videoUrl = taskData.output?.video_url;

      return {
        taskId,
        status,
        videoUrl,
        errorMessage: taskData.error,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error instanceof Error ? error : new Error("Unknown error");

      if (error instanceof VolcVideoApiError && error.statusCode === 401) {
        throw error;
      }

      if ((error as Error).name === "AbortError") {
        throw new VolcVideoApiError("Request timed out");
      }

      if (attempt < MAX_RETRIES) {
        console.warn(`xskill.ai query task attempt ${attempt} failed, retrying...`, error);
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }

  throw new VolcVideoApiError(
    `Failed after ${MAX_RETRIES} attempts: ${lastError?.message}`
  );
}

/**
 * Wait for a video task to complete
 * @param taskId - The task ID to wait for
 * @param options - Polling options
 * @returns Final status with video URL
 */
export async function waitForVideoTask(
  taskId: string,
  options: {
    pollIntervalMs?: number;
    maxWaitMs?: number;
    onProgress?: (status: string) => void;
  } = {}
): Promise<VideoStatusResult> {
  const pollInterval = options.pollIntervalMs ?? 5000;
  const maxWait = options.maxWaitMs ?? 600000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    const status = await getVideoTaskStatus(taskId);

    if (options.onProgress) {
      options.onProgress(status.status);
    }

    if (status.status === "completed") {
      return status;
    }

    if (status.status === "failed") {
      throw new VolcVideoApiError(
        status.errorMessage || "Video generation failed"
      );
    }

    await sleep(pollInterval);
  }

  throw new VolcVideoApiError(
    `Video generation timed out after ${maxWait / 1000} seconds`
  );
}

/**
 * Download video from URL and return as buffer
 * @param videoUrl - URL of the video
 * @returns Video buffer
 */
export async function downloadVideo(videoUrl: string): Promise<Buffer> {
  const response = await fetch(videoUrl);

  if (!response.ok) {
    throw new VolcVideoApiError(`Failed to download video: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
