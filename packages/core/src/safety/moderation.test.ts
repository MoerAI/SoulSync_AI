import { describe, expect, test } from "vitest";

import { displayablePhotos, moderatePhoto, stripExif, type PhotoClassifier } from "./moderation";

const baseJpeg = Uint8Array.from([
  0xff, 0xd8,
  0xff, 0xe1, 0x00, 0x22,
  0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
  0x4d, 0x4d, 0x00, 0x2a,
  0x00, 0x00, 0x00, 0x08,
  0x00, 0x01,
  0x88, 0x25, 0x00, 0x04,
  0x00, 0x00, 0x00, 0x01,
  0x00, 0x00, 0x00, 0x1a,
  0x47, 0x50, 0x53, 0x21,
  0xff, 0xdb, 0x00, 0x04, 0x00, 0x11,
  0xff, 0xda, 0x00, 0x08, 0x01, 0x02, 0x03,
  0xff, 0xd9,
]);

const safeClassifier: PhotoClassifier = {
  classify: async () => ({ nsfw: false, apparentMinor: false }),
};

describe("stripExif", () => {
  test("removes EXIF and GPS metadata from JPEG bytes", () => {
    const stripped = stripExif(Buffer.from(baseJpeg));
    const text = Buffer.from(stripped).toString("latin1");

    expect(text).not.toContain("Exif");
    expect(text).not.toContain("GPS");
    expect(stripped[0]).toBe(0xff);
    expect(stripped[1]).toBe(0xd8);
    expect(stripped.includes(0xdb)).toBe(true);
  });
});

describe("moderatePhoto", () => {
  test("approves a supported safe photo after stripping EXIF", async () => {
    const result = await moderatePhoto(
      { buffer: Buffer.from(baseJpeg), mimeType: "image/jpeg", byteLength: baseJpeg.byteLength },
      safeClassifier,
    );

    expect(result.status).toBe("approved");
    expect(result.previousStatus).toBe("pending");
    expect(Buffer.from(result.buffer).toString("latin1")).not.toContain("Exif");
    expect(result.reasons).toEqual([]);
  });

  test("rejects NSFW classifier results and keeps them out of displayable photos", async () => {
    const result = await moderatePhoto(
      { buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]), mimeType: "image/png", byteLength: 4 },
      { classify: async () => ({ nsfw: true, apparentMinor: false }) },
    );

    expect(result.status).toBe("rejected");
    expect(result.previousStatus).toBe("pending");
    expect(result.reasons).toContain("nsfw");
    expect(displayablePhotos([{ id: "safe", moderation_status: "approved" }, { id: "bad", moderation_status: result.status }]).map((photo) => photo.id)).toEqual(["safe"]);
  });

  test("rejects apparent minors, unsupported MIME types, and oversize files before display", async () => {
    await expect(moderatePhoto({ buffer: Buffer.from([1]), mimeType: "image/gif", byteLength: 1 }, safeClassifier)).rejects.toThrow(/Unsupported image type/);
    await expect(moderatePhoto({ buffer: Buffer.from([1]), mimeType: "image/jpeg", byteLength: 10_000_001 }, safeClassifier)).rejects.toThrow(/exceeds/);

    const result = await moderatePhoto(
      { buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]), mimeType: "image/png", byteLength: 4 },
      { classify: async () => ({ nsfw: false, apparentMinor: true }) },
    );

    expect(result.status).toBe("rejected");
    expect(result.reasons).toEqual(["apparent_minor"]);
  });
});
