# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Spring FES Video — an AI-powered story-to-video generation platform. Users input a story, select a visual style, and the app orchestrates: story → scene descriptions (LLM) → images → videos, with user confirmation at each step. Also supports a "free mode" where users manually create scenes with multimodal material inputs.

## Commands

All commands run from the `hello-nextjs/` directory:

```bash
npm run dev      # Dev server on http://localhost:3000
npm run build    # Production build (also validates TypeScript)
npm run lint     # ESLint
```

No test runner is configured. Validation is `lint` + `build` + manual browser testing.

To bootstrap from repo root: `./init.sh` (installs deps, starts dev server).

## Architecture

### Tech Stack

- **Frontend/Backend:** Next.js 16 with App Router, TypeScript (strict), Tailwind CSS 4
- **Database/Auth/Storage:** Supabase (PostgreSQL + Auth + Storage)
- **LLM:** Zhipu AI GLM-4 (`lib/ai/zhipu.ts`) or Google Gemini (`lib/ai/gemini.ts`) — both implement the same interface (`storyToScenes`, `generateText`, `parseIntent`, `regenerateScenes`)
- **Image Generation:** xskill.ai / Seedream 4.5 (`lib/ai/gemini-image.ts`) or Volcano Engine Seedream (`lib/ai/volc-image.ts`) — task-based async: create → poll → download
- **Video Generation:** xskill.ai / Seedance 2.0 (`lib/ai/volc-video.ts`) — task-based async: create → poll → download. Supports `first_last_frames` and `omni_reference` (multimodal) modes

### Path Alias

`@/*` maps to `./src/*` (configured in `tsconfig.json`).

### Application Code (`hello-nextjs/src/`)

```
app/                    # Next.js App Router — pages + API routes
  api/
    projects/           # CRUD + combine-videos + reference-images endpoints
    scenes/             # Scene updates, confirmations, free-mode scene creation
    generate/           # AI generation: scenes, images, videos, text, video/continue
    materials/          # Material CRUD + upload + attach/detach
    storage/            # Signed URL generation
    parse-intent/       # Natural language intent parsing
    video/              # extract-frame endpoint (ffmpeg-based)
  projects/[id]/        # Project detail page (main working view)
  login/, register/     # Auth pages
  create/               # Project creation with mode selection (story/free)

components/
  auth/                 # LoginForm, RegisterForm, LogoutButton
  project/              # ProjectCard, CreateProjectForm, ModeSelector, StageIndicator, ReferenceImageUploader
  scene/                # SceneDescriptionList, SceneImageList, SceneVideoList, FreeSceneList,
                        # MaterialsPanel, VideoContinueMenu, CompletedProjectView, DraftStageView
  materials/            # NaturalLanguageInput
  providers/            # Providers wrapper
  ui/                   # Toast, Spinner, Skeleton

lib/
  ai/                   # AI API wrappers (see Tech Stack above)
  db/                   # DB helpers: projects.ts, projects-list.ts, scenes.ts, materials.ts, media.ts, video-chains.ts
  supabase/             # Client creation: server.ts (API routes/Server Components), client.ts (browser), middleware.ts (auth refresh)
  video/                # frame-extractor.ts — extracts last frame via ffmpeg (falls back to client-side extraction)
  utils.ts              # cn() helper (clsx + tailwind-merge)

types/
  database.ts           # Supabase-generated DB types + convenience aliases (Project, Scene, Image, Video, Material, VideoChain, etc.)
  ai.ts                 # AI service types

middleware.ts           # Protects /projects and /create; redirects logged-in users away from /login, /register
```

### Core Data Flow

The app uses a staged workflow tracked by `project.stage`: `draft → scenes → images → videos → completed`. Each scene has independent statuses (`image_status`, `video_status`) and confirm flags. Scenes also have a `mode` field: `"story"` (LLM-generated) or `"free"` (manually created with materials).

Video generation is async — tasks are submitted, then polled via `POST /api/generate/video/task/:taskId`. The xskill.ai API uses POST for both create and query (not GET).

### Key Patterns

- **Server vs Client Components:** Server components for data fetching (async), client components (`"use client"`) for interactivity. The project detail page (`projects/[id]/page.tsx`) is a server component that conditionally renders different stage views.
- **AI API calls:** All wrappers include retry logic (3 attempts, exponential backoff) and 60-second timeouts. Auth errors (401/403) are not retried.
- **Dual AI providers:** LLM has Zhipu and Gemini implementations with identical exported functions. Image gen has `volc-image.ts` (Volcano direct) and `gemini-image.ts` (xskill.ai). Video gen uses xskill.ai exclusively. The backward-compat aliases (e.g., `VolcImageApiError` re-exported from `gemini-image.ts`) let consuming routes work without import changes.
- **Video chaining:** `frame-extractor.ts` downloads a video, uses ffmpeg to extract the last frame, and optionally uploads it to Supabase Storage. If ffmpeg is unavailable, returns `needsClientExtraction: true` for browser-side canvas extraction.
- **Supabase clients:** Three variants — server (for API routes + Server Components), client (for browser), middleware (for auth session refresh in middleware.ts).
- **Signed URLs:** Storage paths in the DB are resolved to signed URLs at read time via `getSignedUrl()` in `lib/db/media.ts`.

### Database Tables

`projects` → `scenes` → `images` / `videos` (1:many). Also: `materials` (multimodal scene attachments: audio/video/image/text), `video_chains` → `video_chain_items` (linked video sequences with parent references).

Key enums: `project_stage`, `image_status`, `video_status`, `material_type` (`audio|video|image|text`), `scene_mode` (`story|free`).

Migrations live in `hello-nextjs/supabase/migrations/`.

## Environment Variables

Required in `hello-nextjs/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
XSKILL_API_KEY          # Used by video gen (volc-video.ts) and image gen (gemini-image.ts)
```

Optional / alternative providers:
```
ZHIPU_API_KEY           # For Zhipu GLM LLM
ZHIPU_BASE_URL          # Override Zhipu endpoint (default: https://open.bigmodel.cn/api/paas/v4)
ZHIPU_MODEL             # Override model (default: glm-4)
GEMINI_API_KEY          # For Google Gemini LLM
GEMINI_MODEL            # Override model (default: gemini-3-pro-preview)
VOLC_API_KEY            # For Volcano Engine direct image gen (volc-image.ts)
VOLC_IMAGE_BASE_URL     # Override Volcano image endpoint
SUPABASE_SERVICE_ROLE_KEY  # For admin operations
```

## Workflow Conventions

- Task definitions live in `task.json` at the repo root; progress is logged in `progress.txt`
- Bilingual codebase — AI prompts and some comments are in Chinese; UI text is in English
- When making changes: pass `lint` + `build` before considering work complete
- For UI changes, browser testing is expected (the app requires Supabase + API keys to fully function)
- Detailed architecture docs available in `architecture.md` (DB schema, API endpoints, flow diagrams)
- Feature specs for multimodal/continuation work are in `.trae/specs/`
