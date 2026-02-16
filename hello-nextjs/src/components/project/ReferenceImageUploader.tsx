"use client";

import { useState, useRef, useCallback } from "react";
import { Spinner } from "@/components/ui/Spinner";

interface ReferenceImage {
  storage_path: string;
  url: string;
}

interface ReferenceImageUploaderProps {
  projectId: string;
  initialImages: ReferenceImage[];
}

const MAX_IMAGES = 4;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];

export function ReferenceImageUploader({
  projectId,
  initialImages,
}: ReferenceImageUploaderProps) {
  const [images, setImages] = useState<ReferenceImage[]>(initialImages);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(
    async (file: File) => {
      setError(null);

      // Validate
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
        setError("Invalid file type. Allowed: png, jpg, jpeg, webp");
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError("File too large. Maximum size is 10MB");
        return;
      }
      if (images.length >= MAX_IMAGES) {
        setError(`Maximum ${MAX_IMAGES} reference images allowed`);
        return;
      }

      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch(
          `/api/projects/${projectId}/reference-images`,
          { method: "POST", body: formData }
        );

        const data = await response.json();

        if (!response.ok) {
          setError(data.error ?? "Upload failed");
          return;
        }

        setImages((prev) => [...prev, data.referenceImage]);
      } catch {
        setError("Upload failed. Please try again.");
      } finally {
        setIsUploading(false);
      }
    },
    [images.length, projectId]
  );

  const handleDelete = async (storagePath: string) => {
    setError(null);
    setDeletingPath(storagePath);

    try {
      const response = await fetch(
        `/api/projects/${projectId}/reference-images`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storage_path: storagePath }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        setError(data.error ?? "Delete failed");
        return;
      }

      setImages((prev) => prev.filter((img) => img.storage_path !== storagePath));
    } catch {
      setError("Delete failed. Please try again.");
    } finally {
      setDeletingPath(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUpload(file);
    }
    // Reset input so the same file can be re-selected
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) {
        handleUpload(file);
      }
    },
    [handleUpload]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Reference Images (Optional)
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Upload reference images for style-consistent generation. Max {MAX_IMAGES} images.
          </p>
        </div>
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          {images.length}/{MAX_IMAGES}
        </span>
      </div>

      {error && (
        <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Thumbnail grid */}
      <div className="mb-3 grid grid-cols-4 gap-3">
        {images.map((img) => (
          <div
            key={img.storage_path}
            className="group relative aspect-square overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.url}
              alt="Reference"
              className="h-full w-full object-cover"
            />
            <button
              onClick={() => handleDelete(img.storage_path)}
              disabled={deletingPath === img.storage_path}
              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover:opacity-100 disabled:opacity-50"
              title="Remove"
            >
              {deletingPath === img.storage_path ? (
                <Spinner size="sm" />
              ) : (
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              )}
            </button>
          </div>
        ))}

        {/* Upload drop zone */}
        {images.length < MAX_IMAGES && (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
            className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-zinc-300 bg-zinc-50 transition-colors hover:border-zinc-400 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800/50 dark:hover:border-zinc-500 dark:hover:bg-zinc-800"
          >
            {isUploading ? (
              <Spinner size="sm" />
            ) : (
              <>
                <svg
                  className="mb-1 h-6 w-6 text-zinc-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                <span className="text-xs text-zinc-400">Upload</span>
              </>
            )}
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
