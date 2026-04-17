/**
 * Shared media rotation types used across components and pages.
 */

/** Rotation metadata for a media item that may be leaving the library. */
export interface RotationMeta {
  /** Current rotation status. 'leaving' means the item is scheduled for removal. */
  rotationStatus?: 'leaving' | 'protected' | null;
  /** ISO date string for when the item leaves rotation. Required when rotationStatus is 'leaving'. */
  rotationExpiresAt?: string | null;
}
