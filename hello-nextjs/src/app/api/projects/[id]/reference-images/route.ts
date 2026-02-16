/**
 * Reference images API for projects.
 * POST /api/projects/:id/reference-images - Upload a reference image
 * GET /api/projects/:id/reference-images - List reference images with signed URLs
 * DELETE /api/projects/:id/reference-images - Remove a reference image
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProjectById } from "@/lib/db/projects";
import { getSignedUrl } from "@/lib/db/media";
import type { ReferenceImage } from "@/types/database";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const MAX_REFERENCE_IMAGES = 4;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MEDIA_BUCKET = "project-media";

/**
 * POST /api/projects/:id/reference-images - Upload a reference image
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: projectId } = await params;

    // Verify project ownership
    const project = await getProjectById(projectId, user.id);

    // Parse current reference images
    const currentRefs = (project.reference_images ?? []) as unknown as ReferenceImage[];

    if (currentRefs.length >= MAX_REFERENCE_IMAGES) {
      return NextResponse.json(
        { error: `Maximum ${MAX_REFERENCE_IMAGES} reference images allowed` },
        { status: 400 }
      );
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Allowed: png, jpg, jpeg, webp" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10MB" },
        { status: 400 }
      );
    }

    // Upload to storage
    const timestamp = Date.now();
    const ext = file.name.split(".").pop() || "png";
    const fileName = `ref-${timestamp}.${ext}`;
    const storagePath = `${user.id}/${projectId}/references/${fileName}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type,
      });

    if (uploadError) {
      console.error("Error uploading reference image:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload image" },
        { status: 500 }
      );
    }

    // Generate signed URL
    const signedUrl = await getSignedUrl(storagePath);

    // Update project's reference_images array
    const newRef: ReferenceImage = { storage_path: storagePath, url: signedUrl };
    const updatedRefs = [...currentRefs, newRef];

    const { error: updateError } = await supabase
      .from("projects")
      .update({
        reference_images: JSON.parse(JSON.stringify(updatedRefs)),
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId);

    if (updateError) {
      console.error("Error updating project reference images:", updateError);
      return NextResponse.json(
        { error: "Failed to update project" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      referenceImage: newRef,
      total: updatedRefs.length,
    });
  } catch (error) {
    console.error("Error uploading reference image:", error);

    if (error instanceof Error && error.message.includes("not found")) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json(
      { error: "Failed to upload reference image" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/projects/:id/reference-images - List reference images with fresh signed URLs
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: projectId } = await params;

    const project = await getProjectById(projectId, user.id);
    const refs = (project.reference_images ?? []) as unknown as ReferenceImage[];

    // Refresh signed URLs
    const refsWithUrls = await Promise.all(
      refs.map(async (ref) => {
        const url = await getSignedUrl(ref.storage_path);
        return { ...ref, url };
      })
    );

    return NextResponse.json({
      referenceImages: refsWithUrls,
      total: refsWithUrls.length,
    });
  } catch (error) {
    console.error("Error fetching reference images:", error);

    if (error instanceof Error && error.message.includes("not found")) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json(
      { error: "Failed to fetch reference images" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/projects/:id/reference-images - Remove a reference image
 * Body: { storage_path: string }
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: projectId } = await params;
    const body = await request.json();
    const { storage_path } = body;

    if (!storage_path || typeof storage_path !== "string") {
      return NextResponse.json(
        { error: "storage_path is required" },
        { status: 400 }
      );
    }

    const project = await getProjectById(projectId, user.id);
    const currentRefs = (project.reference_images ?? []) as unknown as ReferenceImage[];

    // Find and remove the reference
    const updatedRefs = currentRefs.filter(
      (ref) => ref.storage_path !== storage_path
    );

    if (updatedRefs.length === currentRefs.length) {
      return NextResponse.json(
        { error: "Reference image not found" },
        { status: 404 }
      );
    }

    // Delete from storage
    const { error: deleteError } = await supabase.storage
      .from(MEDIA_BUCKET)
      .remove([storage_path]);

    if (deleteError) {
      console.error("Error deleting reference image from storage:", deleteError);
      // Continue to update DB even if storage delete fails
    }

    // Update project
    const { error: updateError } = await supabase
      .from("projects")
      .update({
        reference_images: JSON.parse(JSON.stringify(updatedRefs)),
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId);

    if (updateError) {
      console.error("Error updating project reference images:", updateError);
      return NextResponse.json(
        { error: "Failed to update project" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      total: updatedRefs.length,
    });
  } catch (error) {
    console.error("Error deleting reference image:", error);

    if (error instanceof Error && error.message.includes("not found")) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json(
      { error: "Failed to delete reference image" },
      { status: 500 }
    );
  }
}
