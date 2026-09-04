import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { callWithRetry } from './ai-helpers';
import { GEMINI_MODEL } from './ai-config';

/**
 * Transcribes a partner submission video so stories can be triaged without
 * anyone having to watch the clip.
 *
 * Why this exists: the editorial value of a school video is almost entirely in
 * what is *said* — a headteacher's quote, a pupil describing what they did. A
 * reviewer with fifty submissions will not open fifty videos. Turning speech into
 * text makes the clip skimmable, searchable, and usable as raw material for the
 * draft generator, which only reads text.
 *
 * Deliberately a separate trigger from analyzeSubmissionThemes rather than part of
 * it: transcription is slow and can fail on its own terms (bad audio, silent clip),
 * and it must never delay or block the editorial scoring that every submission gets.
 * The two run in parallel; the transcript is appended to the submission when ready.
 */

const MAX_TRANSCRIPT_CHARS = 8000;

export const transcribeSubmissionVideo = functions
  .runWith({
    // A 200MB download plus the SDK's buffering needs real headroom, and Gemini
    // file processing is not fast. Both are sized for the worst case, not the median.
    memory: '2GB',
    timeoutSeconds: 540,
  })
  .firestore.document('orgs/{orgId}/submissions/{submissionId}')
  .onCreate(async (snap, context) => {
    const { orgId, submissionId } = context.params;
    const submission = snap.data();

    const storagePath: string | undefined = submission?.videoStoragePath;
    if (!storagePath) {
      // No video on this submission — nothing to do. Status was already set to
      // 'skipped' at submission time, so no write is needed here.
      return;
    }

    const geminiApiKey = functions.config().gemini?.key || process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      console.warn('[transcribeSubmissionVideo] Gemini API key not configured. Skipping.');
      await markStatus(orgId, submissionId, 'failed');
      return;
    }

    const tempFilePath = path.join(os.tmpdir(), `${submissionId}.mp4`);
    let uploadedFileName: string | null = null;

    try {
      console.log(`[transcribeSubmissionVideo] Transcribing ${storagePath}`);

      // 1. Pull the clip out of Storage onto the function's local disk.
      await admin.storage().bucket().file(storagePath).download({ destination: tempFilePath });

      // 2. Hand it to Gemini via the Files API. Inline base64 is capped well below
      //    our 200MB ceiling, so the Files API is the only viable route here.
      const { GoogleAIFileManager, FileState } = await import('@google/generative-ai/server');
      const fileManager = new GoogleAIFileManager(geminiApiKey);

      const uploadResult = await fileManager.uploadFile(tempFilePath, {
        mimeType: 'video/mp4',
        displayName: `submission-${submissionId}`,
      });
      uploadedFileName = uploadResult.file.name;

      // 3. Gemini processes video asynchronously — poll until it leaves PROCESSING.
      let file = uploadResult.file;
      const startedAt = Date.now();
      while (file.state === FileState.PROCESSING) {
        if (Date.now() - startedAt > 240000) {
          throw new Error('Gemini file processing timed out after 4 minutes');
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
        file = await fileManager.getFile(uploadedFileName);
      }

      if (file.state === FileState.FAILED) {
        throw new Error('Gemini could not process the video file');
      }

      // 4. Transcribe.
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

      const prompt = `Transcribe the spoken audio in this video.

Rules:
- Return ONLY the spoken words, as clean readable prose with normal punctuation.
- Attribute speakers as "Speaker 1:", "Speaker 2:" etc. ONLY if more than one person speaks.
- Do NOT describe the visuals, the setting, or what people are doing.
- Do NOT add commentary, summary, or headings.
- Do NOT invent words. If a passage is inaudible, write [inaudible].
- If nobody speaks at all, reply with exactly: NO_SPEECH

This is footage from a UK school. Expect British English spelling and UK education
terminology (Year 4, key stage, headteacher, Ofsted).`;

      const result = await callWithRetry(
        () =>
          model.generateContent([
            { fileData: { mimeType: file.mimeType, fileUri: file.uri } },
            { text: prompt },
          ]),
        null,
        'transcribeSubmissionVideo'
      );

      if (!result) {
        throw new Error('Transcription returned no result after retries');
      }

      const raw = result.response.text().trim();

      if (!raw || raw === 'NO_SPEECH') {
        await markStatus(orgId, submissionId, 'complete', '');
        console.log(`[transcribeSubmissionVideo] No speech detected in ${submissionId}`);
        return;
      }

      // Guard the Firestore document against a runaway response. A 60s clip cannot
      // legitimately produce 8000 characters of speech, so truncation here means
      // something went wrong rather than losing real content.
      const transcript =
        raw.length > MAX_TRANSCRIPT_CHARS ? `${raw.slice(0, MAX_TRANSCRIPT_CHARS)}…` : raw;

      await markStatus(orgId, submissionId, 'complete', transcript);
      console.log(
        `[transcribeSubmissionVideo] Transcribed ${submissionId} (${transcript.length} chars)`
      );
    } catch (error: any) {
      // Best-effort by design: a failed transcript must never sink the submission.
      // The video is still there and still watchable; only the convenience is lost.
      console.error(
        `[transcribeSubmissionVideo] Failed for ${submissionId}:`,
        error?.message || error
      );
      await markStatus(orgId, submissionId, 'failed');
    } finally {
      // Clean up both the local temp file and the copy held in Gemini's file store.
      // Skipping the remote delete would leave school footage sitting in a third-party
      // store for 48 hours, which is exactly the thing a school DPO would ask about.
      try {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      } catch (err: any) {
        console.warn('[transcribeSubmissionVideo] Temp file cleanup failed:', err?.message);
      }

      if (uploadedFileName) {
        try {
          const { GoogleAIFileManager } = await import('@google/generative-ai/server');
          const fileManager = new GoogleAIFileManager(
            functions.config().gemini?.key || process.env.GEMINI_API_KEY || ''
          );
          await fileManager.deleteFile(uploadedFileName);
        } catch (err: any) {
          console.warn('[transcribeSubmissionVideo] Remote file cleanup failed:', err?.message);
        }
      }
    }
  });

async function markStatus(
  orgId: string,
  submissionId: string,
  status: 'complete' | 'failed',
  transcript?: string
): Promise<void> {
  const update: Record<string, any> = {
    videoTranscriptStatus: status,
    videoTranscribedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (transcript !== undefined) {
    update.videoTranscript = transcript;
  }

  try {
    await admin
      .firestore()
      .collection('orgs')
      .doc(orgId)
      .collection('submissions')
      .doc(submissionId)
      .update(update);
  } catch (err: any) {
    console.warn(
      `[transcribeSubmissionVideo] Could not write status for ${submissionId}:`,
      err?.message
    );
  }
}
