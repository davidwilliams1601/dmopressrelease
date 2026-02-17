import { FirebaseStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

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
