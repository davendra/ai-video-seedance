-- Add reference_images column to projects table
-- Stores an array of reference image objects: [{ storage_path, url }]
ALTER TABLE projects ADD COLUMN reference_images JSONB DEFAULT '[]';
