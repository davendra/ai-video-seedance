import { Header } from "@/components/layout/Header";
import { StageIndicator } from "@/components/project/StageIndicator";
import { ReferenceImageUploader } from "@/components/project/ReferenceImageUploader";
import { DraftStageView } from "@/components/scene/DraftStageView";
import { SceneDescriptionList } from "@/components/scene/SceneDescriptionList";
import { SceneImageList } from "@/components/scene/SceneImageList";
import { SceneVideoList } from "@/components/scene/SceneVideoList";
import { FreeSceneList } from "@/components/scene/FreeSceneList";
import { CompletedProjectView } from "@/components/scene/CompletedProjectView";
import { createClient } from "@/lib/supabase/server";
import { getProjectById } from "@/lib/db/projects";
import { getSignedUrl } from "@/lib/db/media";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import type { ReferenceImage } from "@/types/database";

interface ProjectDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function ProjectDetailPage({
  params,
}: ProjectDetailPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { id } = await params;

  let project;
  try {
    project = await getProjectById(id, user.id);
  } catch {
    notFound();
  }

  const freeScenes = project.scenes.filter((s) => s.mode === "free");
  const storyScenes = project.scenes.filter((s) => s.mode !== "free");

  // Resolve fresh signed URLs for storage-based refs; keep external URLs as-is
  const rawRefs = (project.reference_images ?? []) as unknown as ReferenceImage[];
  const referenceImages: ReferenceImage[] = await Promise.all(
    rawRefs.map(async (ref) => {
      if (ref.storage_path) {
        return { storage_path: ref.storage_path, url: await getSignedUrl(ref.storage_path) };
      }
      return ref;
    })
  );

  const styleNames: Record<string, string> = {
    realistic: "Realistic",
    anime: "Anime",
    cartoon: "Cartoon",
    cinematic: "Cinematic",
    watercolor: "Watercolor",
    oil_painting: "Oil Painting",
    sketch: "Sketch",
    cyberpunk: "Cyberpunk",
    fantasy: "Fantasy",
    scifi: "Sci-Fi",
  };

  const createdDate = new Date(project.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const updatedDate = new Date(project.updated_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      <Header user={user} />
      <main className="flex flex-1 flex-col px-4 py-8">
        <div className="mx-auto w-full max-w-4xl">
          {/* Breadcrumb */}
          <div className="mb-6">
            <Link
              href="/projects"
              className="inline-flex items-center gap-1 text-sm text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Back to Projects
            </Link>
          </div>

          {/* Project Header */}
          <div className="mb-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                  {project.title}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
                  {project.style && (
                    <span className="rounded-md bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
                      {styleNames[project.style] ?? project.style}
                    </span>
                  )}
                  <span>{project.scenes.length} scenes</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800">
                  Edit Project
                </button>
                <button className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900/50 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-900/20">
                  Delete Project
                </button>
              </div>
            </div>

            {/* Story */}
            {project.story && (
              <div className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-800/50">
                <h3 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Story Content
                </h3>
                <p className="text-zinc-600 dark:text-zinc-400">
                  {project.story}
                </p>
              </div>
            )}

            {/* Meta info */}
            <div className="mt-4 flex gap-6 text-sm text-zinc-500 dark:text-zinc-400">
              <span>Created on {createdDate}</span>
              <span>Updated on {updatedDate}</span>
            </div>
          </div>

          {/* Stage Indicator */}
          <div className="mb-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Project Progress
            </h2>
            <StageIndicator currentStage={project.stage} />
          </div>

          {/* Content based on stage */}
          <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {project.stage === "draft" && "Start Creating"}
              {project.stage === "scenes" && "Scene Descriptions"}
              {project.stage === "images" && "Image Generation"}
              {project.stage === "videos" && "Video Generation"}
              {project.stage === "completed" && "Project Completed"}
            </h2>

            {project.stage === "draft" && (
              <DraftStageView projectId={project.id} />
            )}

            {project.stage === "scenes" && (
              <SceneDescriptionList
                projectId={project.id}
                scenes={storyScenes}
              />
            )}

            {project.stage === "images" && (
              <>
                <ReferenceImageUploader
                  projectId={project.id}
                  initialImages={referenceImages}
                />
                <SceneImageList
                  projectId={project.id}
                  scenes={storyScenes}
                />
              </>
            )}

            {project.stage === "videos" && (
              <SceneVideoList
                projectId={project.id}
                scenes={storyScenes}
              />
            )}

            {project.stage === "completed" && (
              <CompletedProjectView
                projectId={project.id}
                scenes={project.scenes}
                completedAt={project.updated_at}
              />
            )}
          </div>

          {/* Free Mode Section */}
          {freeScenes.length > 0 && (
            <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Free Mode Scenes
              </h2>
              <FreeSceneList
                projectId={project.id}
                scenes={freeScenes}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
