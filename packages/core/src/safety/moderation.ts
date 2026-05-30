export type PhotoModerationStatus = "pending" | "approved" | "rejected";
export type PhotoModerationReason = "nsfw" | "apparent_minor";

export type PhotoModerationInput = {
  buffer: Uint8Array;
  mimeType: string;
  byteLength?: number;
  maxBytes?: number;
};

export type PhotoClassifierResult = {
  nsfw: boolean;
  apparentMinor: boolean;
  scores?: Record<string, number>;
};

export type PhotoClassifier = {
  classify: (input: { buffer: Uint8Array; mimeType: string }) => Promise<PhotoClassifierResult>;
};

export type PhotoModerationResult = {
  previousStatus: "pending";
  status: "approved" | "rejected";
  reasons: PhotoModerationReason[];
  buffer: Uint8Array;
  mimeType: string;
};

export type PhotoDisplayRow = {
  moderation_status?: string | null;
};

const DEFAULT_MAX_BYTES = 10_000_000;
const SUPPORTED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export const moderatePhoto = async (input: PhotoModerationInput, classifier: PhotoClassifier): Promise<PhotoModerationResult> => {
  validatePhoto(input);
  const stripped = stripExif(input.buffer);
  const classification = await classifier.classify({ buffer: stripped, mimeType: input.mimeType });
  const reasons: PhotoModerationReason[] = [];

  if (classification.nsfw) {
    reasons.push("nsfw");
  }

  if (classification.apparentMinor) {
    reasons.push("apparent_minor");
  }

  return {
    previousStatus: "pending",
    status: reasons.length > 0 ? "rejected" : "approved",
    reasons,
    buffer: stripped,
    mimeType: input.mimeType,
  };
};

export const stripExif = (buffer: Uint8Array): Uint8Array => {
  if (!isJpeg(buffer)) {
    return copyBytes(buffer);
  }

  const chunks: Uint8Array[] = [buffer.slice(0, 2)];
  let offset = 2;

  while (offset + 4 <= buffer.length && buffer[offset] === 0xff) {
    const marker = buffer[offset + 1];

    if (marker === 0xda || marker === 0xd9) {
      chunks.push(buffer.slice(offset));
      return concatLike(buffer, chunks);
    }

    if (marker >= 0xd0 && marker <= 0xd7) {
      chunks.push(buffer.slice(offset, offset + 2));
      offset += 2;
      continue;
    }

    const segmentLength = (buffer[offset + 2] << 8) + buffer[offset + 3];
    const segmentEnd = offset + 2 + segmentLength;

    if (segmentLength < 2 || segmentEnd > buffer.length) {
      chunks.push(buffer.slice(offset));
      return concatLike(buffer, chunks);
    }

    if (!isExifSegment(buffer, offset, marker)) {
      chunks.push(buffer.slice(offset, segmentEnd));
    }

    offset = segmentEnd;
  }

  if (offset < buffer.length) {
    chunks.push(buffer.slice(offset));
  }

  return concatLike(buffer, chunks);
};

export const isPhotoDisplayable = (photo: PhotoDisplayRow): boolean => photo.moderation_status === "approved";

export const displayablePhotos = <Photo extends PhotoDisplayRow>(photos: readonly Photo[]): Photo[] => photos.filter(isPhotoDisplayable);

const validatePhoto = (input: PhotoModerationInput): void => {
  if (!SUPPORTED_MIME_TYPES.has(input.mimeType)) {
    throw new Error(`Unsupported image type: ${input.mimeType}`);
  }

  const size = input.byteLength ?? input.buffer.byteLength;
  const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES;

  if (size > maxBytes) {
    throw new Error(`Photo exceeds ${maxBytes} byte upload limit`);
  }
};

const isJpeg = (buffer: Uint8Array): boolean => buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8;

const isExifSegment = (buffer: Uint8Array, offset: number, marker: number): boolean =>
  marker === 0xe1 && buffer[offset + 4] === 0x45 && buffer[offset + 5] === 0x78 && buffer[offset + 6] === 0x69 && buffer[offset + 7] === 0x66 && buffer[offset + 8] === 0x00 && buffer[offset + 9] === 0x00;

const copyBytes = (buffer: Uint8Array): Uint8Array => concatLike(buffer, [buffer]);

const concatLike = (source: Uint8Array, chunks: Uint8Array[]): Uint8Array => {
  const sourceConstructor = source.constructor as { concat?: (items: Uint8Array[]) => Uint8Array };

  if (typeof sourceConstructor.concat === "function") {
    return sourceConstructor.concat(chunks);
  }

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }

  return output;
};
