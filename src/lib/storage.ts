import {
  FirebaseStorage,
  ref,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';

/**
 * Partner submission video constraints.
 *
 * MP4 only, deliberately. Phones (especially iOS) record HEVC in a .mov container,
 * which uploads happily and then fails to play in Chrome and Firefox — the file looks
 * fine to the partner and is unreviewable for the person triaging it. We have no
 * transcoding step, so the constraint is enforced at the point of upload instead.
 *
 * The duration cap matters more than the size cap for cost: every playback in the
 * submissions inbox streams the whole object, and egress is the expensive part.
 */
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200MB — mirrored in storage.rules
export const MAX_VIDEO_DURATION_SECONDS = 60;
export const ACCEPTED_VIDEO_MIME_TYPES = ['video/mp4'];

/**
 * Reads a video's duration in the browser without uploading it, by loading the
 * file's object URL into a detached <video> element and waiting for metadata.
 *
 * Resolves to null when the browser cannot decode the file at all — that is itself
 * a useful signal, since a file this browser can't read is a file the reviewer's
 * browser probably can't read either.
 */
export function probeVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    let settled = false;

    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute('src');
      resolve(value);
    };

    // Guard against a file that never fires either event (corrupt/unsupported codec).
    const timeout = setTimeout(() => finish(null), 15000);

    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      clearTimeout(timeout);
      const duration = Number.isFinite(video.duration) ? video.duration : null;
      finish(duration);
    };
    video.onerror = () => {
      clearTimeout(timeout);
      finish(null);
    };

    video.src = objectUrl;
  });
}

/**
 * Validates a candidate submission video. Async because the duration check requires
 * decoding metadata; call this before starting an upload.
 */
export async function validateVideoFile(
  file: File
): Promise<{ valid: boolean; error?: string }> {
  if (!ACCEPTED_VIDEO_MIME_TYPES.includes(file.type)) {
    return {
      valid: false,
      error:
        'Video must be an MP4. If this was filmed on an iPhone, open Settings \u2192 Camera \u2192 Formats and choose "Most Compatible", or export the clip as MP4 before uploading.',
    };
  }

  if (file.size > MAX_VIDEO_BYTES) {
    return {
      valid: false,
      error: `Video must be smaller than ${Math.round(MAX_VIDEO_BYTES / (1024 * 1024))}MB.`,
    };
  }

  const duration = await probeVideoDuration(file);

  if (duration === null) {
    return {
      valid: false,
      error:
        'This video could not be read in the browser. It may use an unsupported codec \u2014 please export it as MP4 (H.264) and try again.',
    };
  }

  if (duration > MAX_VIDEO_DURATION_SECONDS) {
    return {
      valid: false,
      error: `Video must be ${MAX_VIDEO_DURATION_SECONDS} seconds or shorter (this one is ${Math.round(duration)}s).`,
    };
  }

  return { valid: true };
}

/**
 * Validates that a file is an acceptable image for upload
 * @param file The file to validate
 * @returns Object with valid boolean and optional error message
 */
export function validateImageFile(file: File): { valid: boolean; error?: string } {
  // Check file type
  if (!file.type.startsWith('image/')) {
    return {
      valid: false,
      error: 'File must be an image (jpg, png, gif, webp, etc.)'
    };
  }

  // Check file size (10MB limit)
  const maxSize = 10 * 1024 * 1024; // 10MB in bytes
  if (file.size > maxSize) {
    return {
      valid: false,
      error: 'Image must be smaller than 10MB'
    };
  }

  return { valid: true };
}

/**
 * Uploads a release image to Firebase Storage
 * @param storage Firebase Storage instance
 * @param orgId Organization ID
 * @param releaseId Release ID
 * @param file Image file to upload
 * @returns Object with storage path and download URL
 */
export async function uploadReleaseImage(
  storage: FirebaseStorage,
  orgId: string,
  releaseId: string,
  file: File
): Promise<{ storagePath: string; downloadUrl: string }> {
  // Validate the file first
  const validation = validateImageFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Get file extension from the file name
  const fileExtension = file.name.split('.').pop() || 'jpg';

  // Create storage path: /orgs/{orgId}/releases/{releaseId}/image.{ext}
  const storagePath = `orgs/${orgId}/releases/${releaseId}/image.${fileExtension}`;

  // Create a storage reference
  const storageRef = ref(storage, storagePath);

  // Upload the file
  await uploadBytes(storageRef, file, {
    contentType: file.type,
    customMetadata: {
      originalFileName: file.name,
      uploadedAt: new Date().toISOString()
    }
  });

  // Get the download URL
  const downloadUrl = await getDownloadURL(storageRef);

  return {
    storagePath,
    downloadUrl
  };
}

/**
 * Deletes a release image from Firebase Storage
 * @param storage Firebase Storage instance
 * @param storagePath The storage path to delete
 */
/**
 * Uploads a submission image to Firebase Storage
 */
export async function uploadSubmissionImage(
  storage: FirebaseStorage,
  orgId: string,
  submissionId: string,
  file: File,
  index: number
): Promise<{ storagePath: string; downloadUrl: string }> {
  const validation = validateImageFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const fileExtension = file.name.split('.').pop() || 'jpg';
  const storagePath = `orgs/${orgId}/submissions/${submissionId}/image-${index}.${fileExtension}`;
  const storageRef = ref(storage, storagePath);

  await uploadBytes(storageRef, file, {
    contentType: file.type,
    customMetadata: {
      originalFileName: file.name,
      uploadedAt: new Date().toISOString(),
    },
  });

  const downloadUrl = await getDownloadURL(storageRef);

  return { storagePath, downloadUrl };
}

/**
 * Deletes a submission image from Firebase Storage
 */
export async function deleteSubmissionImage(
  storage: FirebaseStorage,
  storagePath: string
): Promise<void> {
  if (!storagePath) return;
  try {
    const storageRef = ref(storage, storagePath);
    await deleteObject(storageRef);
  } catch (error: any) {
    if (error.code !== 'storage/object-not-found') {
      throw error;
    }
  }
}

/**
 * Uploads a partner submission video to Firebase Storage.
 * Path: orgs/{orgId}/submissions/{submissionId}/video/clip.mp4
 *
 * Uses a resumable upload rather than uploadBytes: uploadBytes buffers the whole
 * file in memory and gives no progress events, which is tolerable for a 10MB image
 * and hostile for a 200MB clip on a school laptop or a phone on mobile data.
 * Resumable uploads chunk the transfer and survive brief connection drops.
 *
 * Assumes validateVideoFile() has already passed — call it first.
 */
export function uploadSubmissionVideo(
  storage: FirebaseStorage,
  orgId: string,
  submissionId: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<{ storagePath: string; downloadUrl: string }> {
  // Fixed filename: one video per submission, so a re-upload overwrites cleanly
  // instead of orphaning the previous object under the same prefix.
  const storagePath = `orgs/${orgId}/submissions/${submissionId}/video/clip.mp4`;
  const storageRef = ref(storage, storagePath);

  const task = uploadBytesResumable(storageRef, file, {
    contentType: file.type,
    customMetadata: {
      originalFileName: file.name,
      uploadedAt: new Date().toISOString(),
    },
  });

  return new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      (snapshot) => {
        if (!onProgress || snapshot.totalBytes === 0) return;
        onProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
      },
      (error) => reject(error),
      async () => {
        try {
          const downloadUrl = await getDownloadURL(task.snapshot.ref);
          resolve({ storagePath, downloadUrl });
        } catch (error) {
          reject(error);
        }
      }
    );
  });
}

/**
 * Deletes a submission video from Firebase Storage.
 */
export async function deleteSubmissionVideo(
  storage: FirebaseStorage,
  storagePath: string
): Promise<void> {
  if (!storagePath) return;
  try {
    const storageRef = ref(storage, storagePath);
    await deleteObject(storageRef);
  } catch (error: any) {
    if (error.code !== 'storage/object-not-found') {
      throw error;
    }
  }
}

/**
 * Uploads a user avatar to Firebase Storage.
 * Path: orgs/{orgId}/users/{userId}/avatar.{ext}
 */
export async function uploadAvatarImage(
  storage: FirebaseStorage,
  orgId: string,
  userId: string,
  file: File
): Promise<{ storagePath: string; downloadUrl: string }> {
  const validation = validateImageFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const fileExtension = file.name.split('.').pop() || 'jpg';
  const storagePath = `orgs/${orgId}/users/${userId}/avatar.${fileExtension}`;
  const storageRef = ref(storage, storagePath);

  await uploadBytes(storageRef, file, {
    contentType: file.type,
    customMetadata: {
      originalFileName: file.name,
      uploadedAt: new Date().toISOString(),
    },
  });

  const downloadUrl = await getDownloadURL(storageRef);
  return { storagePath, downloadUrl };
}

/**
 * Uploads an org branding logo to Firebase Storage.
 * Path: orgs/{orgId}/branding/logo.{ext}
 * Max 5MB.
 */
export async function uploadBrandingLogo(
  storage: FirebaseStorage,
  orgId: string,
  file: File
): Promise<{ storagePath: string; downloadUrl: string }> {
  if (!file.type.startsWith('image/')) {
    throw new Error('File must be an image');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Logo must be smaller than 5MB');
  }

  const fileExtension = file.name.split('.').pop() || 'png';
  const storagePath = `orgs/${orgId}/branding/logo.${fileExtension}`;
  const storageRef = ref(storage, storagePath);

  await uploadBytes(storageRef, file, {
    contentType: file.type,
    customMetadata: {
      originalFileName: file.name,
      uploadedAt: new Date().toISOString(),
    },
  });

  const downloadUrl = await getDownloadURL(storageRef);
  return { storagePath, downloadUrl };
}

export async function deleteBrandingLogo(
  storage: FirebaseStorage,
  storagePath: string
): Promise<void> {
  if (!storagePath) return;
  try {
    const storageRef = ref(storage, storagePath);
    await deleteObject(storageRef);
  } catch (error: any) {
    if (error.code !== 'storage/object-not-found') {
      throw error;
    }
  }
}

export async function deleteReleaseImage(
  storage: FirebaseStorage,
  storagePath: string
): Promise<void> {
  if (!storagePath) {
    return; // Nothing to delete
  }

  try {
    const storageRef = ref(storage, storagePath);
    await deleteObject(storageRef);
  } catch (error: any) {
    // If the file doesn't exist (404), that's fine - it's already deleted
    if (error.code !== 'storage/object-not-found') {
      throw error;
    }
  }
}
