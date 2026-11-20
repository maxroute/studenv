import * as aiRepository from "@/lib/repositories/ai.repository";
import { fetchYouTubeCaptionText } from "@/lib/services/youtube-captions.service";
import { createVideoTranscriptService } from "@/lib/services/video-transcript.service";

export const ensureVideoTranscript = createVideoTranscriptService({
  findOwnedVideo: aiRepository.findOwnedVideoForTranscript,
  saveTranscript: aiRepository.saveTranscript,
  fetchCaptions: fetchYouTubeCaptionText,
});
