/**
 * Reference image matching utility.
 * Filters reference images based on whether their name appears in a scene description.
 */

import type { ReferenceImage } from "@/types/database";

/**
 * Filter reference images to only those relevant to a given scene description.
 *
 * Rules:
 * - If no refs have names → return all (backward compatibility)
 * - Case-insensitive substring match of ref.name against sceneDescription
 * - If matches found → return only matched refs
 * - If no matches → return all refs (fallback)
 */
export function filterReferencesByScene(
  refs: ReferenceImage[],
  sceneDescription: string
): ReferenceImage[] {
  if (refs.length === 0) return refs;

  const anyNamed = refs.some((ref) => ref.name && ref.name.trim().length > 0);
  if (!anyNamed) return refs;

  const descLower = sceneDescription.toLowerCase();

  const matched = refs.filter(
    (ref) => ref.name && descLower.includes(ref.name.toLowerCase())
  );

  return matched.length > 0 ? matched : refs;
}
