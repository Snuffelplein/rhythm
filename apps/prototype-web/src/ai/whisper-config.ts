// Multilingual model: an English-only (.en) model must never be used here.
export const WHISPER_MODEL='onnx-community/whisper-base';
export const WHISPER_LANGUAGE='dutch';
export const WHISPER_OPTIONS={
  language:WHISPER_LANGUAGE,
  task:'transcribe',
  chunk_length_s:25,
  stride_length_s:4,
  // Include timestamp tokens so overlapping chunks can be stitched correctly.
  return_timestamps:true,
  // Whisper's decoder has 448 positions, including its initial prompt.
  max_new_tokens:440,
  do_sample:false,
} as const;
