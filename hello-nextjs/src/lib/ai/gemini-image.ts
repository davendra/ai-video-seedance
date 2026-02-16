/**
 * Seedream 4.5 Text-to-Image via xskill.ai API.
 * Async task-based: create task → poll for result → download image.
 */

// Configuration
const XSKILL_API_KEY = process.env.XSKILL_API_KEY;
const XSKILL_BASE_URL = "https://api.xskill.ai/api/v3";
const SEEDREAM_MODEL = "fal-ai/bytedance/seedream/v4.5/text-to-image";
const SEEDREAM_EDIT_MODEL = "fal-ai/bytedance/seedream/v4.5/edit";

// Polling configuration
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 60; // 2 minutes max
const REQUEST_TIMEOUT_MS = 30000;

/**
 * Custom error class for image generation errors
 */
export class ImageApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public errorCode?: string
  ) {
    super(message);
    this.name = "ImageApiError";
  }
}

// Backward-compat aliases used by consumer routes
export { ImageApiError as GeminiImageApiError };
export { ImageApiError as VolcImageApiError };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if the API key is configured
 */
export function isImageConfigured(): boolean {
  return !!XSKILL_API_KEY;
}

export { isImageConfigured as isGeminiImageConfigured };
export { isImageConfigured as isVolcImageConfigured };

/**
 * Build style prompt suffix based on video style
 */
function buildStylePrompt(style?: string): string {
  const stylePrompts: Record<string, string> = {
    realistic: ", photorealistic, high quality, natural lighting, sharp details, 8k resolution",
    anime: ", anime style, vibrant colors, clean lines, Japanese animation, high detail",
    cartoon: ", cartoon style, bright colors, playful, exaggerated features",
    cinematic: ", cinematic, dramatic lighting, film grain, professional cinematography, 8k",
    watercolor: ", watercolor painting style, soft edges, delicate colors, artistic",
    oil_painting: ", oil painting style, thick brushstrokes, rich colors, classical art",
    sketch: ", pencil sketch style, detailed linework, grayscale, artistic drawing",
    cyberpunk: ", cyberpunk style, neon lights, futuristic, dark atmosphere, tech aesthetic",
    fantasy: ", fantasy style, magical elements, ethereal, dreamlike, mystical",
    scifi: ", sci-fi style, futuristic, high-tech, space age, advanced technology",
  };

  return stylePrompts[style ?? "realistic"] || stylePrompts.realistic;
}

interface TaskCreateResponse {
  code: number;
  data?: {
    task_id: string;
    price: number;
  };
  message?: string;
}

interface SeedreamImage {
  url: string;
  content_type?: string;
  file_name?: string;
  file_size?: number;
  width?: number | null;
  height?: number | null;
}

interface TaskQueryResponse {
  code: number;
  data?: {
    task_id: string;
    status: string;
    output?: {
      images?: (string | SeedreamImage)[];
      seed?: number;
    };
    error?: string;
  };
  message?: string;
}

/**
 * Create an image generation task
 */
async function createTask(prompt: string, imageSize: string): Promise<string> {
  const response = await fetch(`${XSKILL_BASE_URL}/tasks/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${XSKILL_API_KEY}`,
    },
    body: JSON.stringify({
      model: SEEDREAM_MODEL,
      params: {
        prompt,
        image_size: imageSize,
        num_images: 1,
      },
      channel: null,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const data = (await response.json()) as TaskCreateResponse;

  if (!response.ok) {
    console.error("[seedream] Task creation failed:", JSON.stringify(data));
    throw new ImageApiError(
      data.message || `Failed to create task: HTTP ${response.status}`,
      response.status
    );
  }

  if (data.code !== 200 || !data.data?.task_id) {
    throw new ImageApiError(
      data.message || `Failed to create task: code ${data.code}`,
      data.code
    );
  }

  console.log(`[seedream] Task created: ${data.data.task_id} (cost: ${data.data.price} credits)`);
  return data.data.task_id;
}

/**
 * Poll for task completion and return image URL
 */
async function pollTask(taskId: string): Promise<string> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const response = await fetch(`${XSKILL_BASE_URL}/tasks/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${XSKILL_API_KEY}`,
      },
      body: JSON.stringify({ task_id: taskId }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new ImageApiError(
        `Failed to query task: HTTP ${response.status}`,
        response.status
      );
    }

    const data = (await response.json()) as TaskQueryResponse;

    if (data.code !== 200) {
      throw new ImageApiError(
        data.message || `Task query error: code ${data.code}`,
        data.code
      );
    }

    const status = data.data?.status;

    if (status === "completed") {
      const imageEntry = data.data?.output?.images?.[0];
      if (!imageEntry) {
        throw new ImageApiError("Task completed but no image in response");
      }
      // Handle both string URLs and image objects
      const imageUrl = typeof imageEntry === "string" ? imageEntry : imageEntry.url;
      if (!imageUrl) {
        throw new ImageApiError("Task completed but no image URL in response");
      }
      console.log(`[seedream] Task ${taskId} completed: ${imageUrl.substring(0, 80)}...`);
      return imageUrl;
    }

    if (status === "failed") {
      throw new ImageApiError(
        `Image generation failed: ${data.data?.error || "unknown error"}`
      );
    }

    // Still processing, wait and poll again
    await sleep(POLL_INTERVAL_MS);
  }

  throw new ImageApiError(
    `Task ${taskId} timed out after ${MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS / 1000}s`
  );
}

/**
 * Download image from URL and return as base64
 */
async function downloadImageAsBase64(imageUrl: string): Promise<string> {
  const response = await fetch(imageUrl, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new ImageApiError(
      `Failed to download image: HTTP ${response.status}`,
      response.status
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer).toString("base64");
}

/**
 * Generate an image from a text description using Seedream 4.5
 * @param prompt - The scene description to generate an image for
 * @param style - Optional visual style
 * @returns Base64 encoded image data (without data URI prefix)
 */
export async function generateImage(
  prompt: string,
  style?: string,
  options: { size?: string } = {}
): Promise<string> {
  if (!XSKILL_API_KEY) {
    throw new ImageApiError(
      "Image generation is not configured. Please set XSKILL_API_KEY."
    );
  }

  const stylePrompt = buildStylePrompt(style);
  const fullPrompt = `${prompt}${stylePrompt}`;

  // Map caller sizes to xskill.ai format
  const sizeMap: Record<string, string> = {
    "1K": "auto",
    "2K": "auto_2K",
    "4K": "auto_4K",
    "720p": "auto",
    "1080p": "auto_2K",
  };
  const imageSize = sizeMap[options.size ?? ""] || "auto_2K";

  console.log(`[seedream] Generating image: "${fullPrompt.substring(0, 80)}..."`);

  // Step 1: Create task
  const taskId = await createTask(fullPrompt, imageSize);

  // Step 2: Poll for completion
  const imageUrl = await pollTask(taskId);

  // Step 3: Download and convert to base64
  return downloadImageAsBase64(imageUrl);
}

/**
 * Generate an image and return as a Buffer
 */
export async function generateImageBuffer(
  prompt: string,
  style?: string,
  options?: { size?: string }
): Promise<Buffer> {
  const base64Data = await generateImage(prompt, style, options);
  return Buffer.from(base64Data, "base64");
}

/**
 * Regenerate an image with different parameters
 */
export async function regenerateImage(
  prompt: string,
  style?: string,
  options?: { size?: string }
): Promise<string> {
  return generateImage(prompt, style, options);
}

/**
 * Create an image edit task with reference images
 */
async function createEditTask(
  prompt: string,
  imageUrls: string[],
  imageSize: string
): Promise<string> {
  const response = await fetch(`${XSKILL_BASE_URL}/tasks/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${XSKILL_API_KEY}`,
    },
    body: JSON.stringify({
      model: SEEDREAM_EDIT_MODEL,
      params: {
        prompt,
        image_urls: imageUrls,
        image_size: imageSize,
        num_images: 1,
      },
      channel: null,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const data = (await response.json()) as TaskCreateResponse;

  if (!response.ok) {
    console.error("[seedream-edit] Task creation failed:", JSON.stringify(data));
    throw new ImageApiError(
      data.message || `Failed to create edit task: HTTP ${response.status}`,
      response.status
    );
  }

  if (data.code !== 200 || !data.data?.task_id) {
    throw new ImageApiError(
      data.message || `Failed to create edit task: code ${data.code}`,
      data.code
    );
  }

  console.log(`[seedream-edit] Task created: ${data.data.task_id} (cost: ${data.data.price} credits)`);
  return data.data.task_id;
}

/**
 * Generate an image using the Seedream 4.5 Edit API with reference images.
 * Falls back to text-to-image when no reference images are provided.
 * @param prompt - The scene description
 * @param referenceImageUrls - Public URLs of reference images
 * @param style - Optional visual style
 * @param options - Additional options
 * @returns Base64 encoded image data
 */
export async function generateEditImage(
  prompt: string,
  referenceImageUrls: string[],
  style?: string,
  options: { size?: string } = {}
): Promise<string> {
  if (!referenceImageUrls || referenceImageUrls.length === 0) {
    return generateImage(prompt, style, options);
  }

  if (!XSKILL_API_KEY) {
    throw new ImageApiError(
      "Image generation is not configured. Please set XSKILL_API_KEY."
    );
  }

  const stylePrompt = buildStylePrompt(style);
  const fullPrompt = `${prompt}${stylePrompt}`;

  const sizeMap: Record<string, string> = {
    "1K": "auto",
    "2K": "auto_2K",
    "4K": "auto_4K",
    "720p": "auto",
    "1080p": "auto_2K",
  };
  const imageSize = sizeMap[options.size ?? ""] || "auto_2K";

  console.log(`[seedream-edit] Generating image with ${referenceImageUrls.length} references: "${fullPrompt.substring(0, 80)}..."`);

  // Step 1: Create edit task with reference images
  const taskId = await createEditTask(fullPrompt, referenceImageUrls, imageSize);

  // Step 2: Poll for completion (same polling logic)
  const imageUrl = await pollTask(taskId);

  // Step 3: Download and convert to base64
  return downloadImageAsBase64(imageUrl);
}
