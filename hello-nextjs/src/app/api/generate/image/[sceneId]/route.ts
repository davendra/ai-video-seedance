/**
 * Single scene image generation API.
 * POST /api/generate/image/[sceneId] - Generate image for a single scene
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSceneById, updateSceneImageStatus } from "@/lib/db/scenes";
import { getProjectById } from "@/lib/db/projects";
import {
  generateImage,
  generateEditImage,
  isGeminiImageConfigured,
  GeminiImageApiError,
} from "@/lib/ai/gemini-image";
import {
  uploadAndCreateImage,
  deleteOldSceneImages,
  getPublicImageUrl,
} from "@/lib/db/media";
import type { ReferenceImage } from "@/types/database";

interface RouteParams {
  params: Promise<{ sceneId: string }>;
}

/**
 * POST /api/generate/image/[sceneId] - Generate image for a single scene
 * Body: { projectId: string }
 * Returns: { success: boolean, image: Image, scene: Scene }
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { sceneId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isGeminiImageConfigured()) {
      return NextResponse.json(
        { error: "Image generation service is not configured. Please set GEMINI_API_KEY." },
        { status: 503 }
      );
    }

    // Get request body for projectId
    const body = await request.json().catch(() => ({}));
    const { projectId } = body;

    if (!projectId || typeof projectId !== "string") {
      return NextResponse.json(
        { error: "Project ID is required" },
        { status: 400 }
      );
    }

    // Verify project ownership
    const project = await getProjectById(projectId, user.id);

    // Get the scene
    const scene = await getSceneById(sceneId);

    // Verify scene belongs to the project
    if (scene.project_id !== projectId) {
      return NextResponse.json(
        { error: "Scene does not belong to this project" },
        { status: 400 }
      );
    }

    // Check if scene description is confirmed
    if (!scene.description_confirmed) {
      return NextResponse.json(
        { error: "Scene description must be confirmed before generating image" },
        { status: 400 }
      );
    }

    // Update scene image status to processing
    await updateSceneImageStatus(sceneId, "processing");

    try {
      // Check for reference images on the project
      const referenceImages = (project.reference_images ?? []) as unknown as ReferenceImage[];
      let imageBase64: string;

      if (referenceImages.length > 0) {
        // Resolve public URLs for reference images
        const refUrls = await Promise.all(
          referenceImages.map((ref) => getPublicImageUrl(ref.storage_path))
        );
        imageBase64 = await generateEditImage(
          scene.description,
          refUrls,
          project.style ?? undefined,
          { size: "2K" }
        );
      } else {
        imageBase64 = await generateImage(
          scene.description,
          project.style ?? undefined,
          { size: "2K" }
        );
      }

      // Delete old images from storage and database
      await deleteOldSceneImages(sceneId);

      // Generate filename
      const timestamp = Date.now();
      const fileName = `scene-${scene.order_index}-${timestamp}.png`;

      // Upload to Supabase Storage and create database record
      const image = await uploadAndCreateImage(
        user.id,
        projectId,
        sceneId,
        fileName,
        imageBase64,
        {
          width: 1024,
          height: 1024,
          contentType: "image/png",
        }
      );

      // Update scene image status to completed
      const updatedScene = await updateSceneImageStatus(sceneId, "completed");

      return NextResponse.json({
        success: true,
        image,
        scene: updatedScene,
        message: "Image generated successfully",
      });
    } catch (generationError) {
      // Update scene image status to failed
      await updateSceneImageStatus(sceneId, "failed");
      throw generationError;
    }
  } catch (error) {
    console.error("Error generating image:", error);

    // Handle specific errors
    if (error instanceof GeminiImageApiError) {
      return NextResponse.json(
        { error: `Image generation error: ${error.message}` },
        { status: 502 }
      );
    }

    // Handle project/scene not found errors
    if (error instanceof Error && error.message.includes("not found")) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json(
      { error: "Failed to generate image" },
      { status: 500 }
    );
  }
}
