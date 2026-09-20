/**
 * 真实可解码的最小图片字节（sharp 生成并逐个回读验证）。
 *
 * 上传契约按**文件内容**判定格式，所以测试不能再拿
 * `File(["image-body"], "photo.jpg", { type: "image/jpeg" })` 这种「只有 MIME 是图片」
 * 的伪造体当合法输入。这里的字节是三个允许格式各自真实可解码的 1x1 图片——
 * JPEG 为 DQT/SOF0/DHT/SOS 的基线帧 + EOI，PNG 为 IHDR/pHYs/IDAT/IEND，
 * WebP 为 RIFF/WEBP/VP8 无损帧。它们同时给出「内容正确」与「内容被截断」两个方向。
 *
 * 注意边界：适配层校验的是 **magic bytes + 结构完整性**（EOI/IEND/RIFF 长度自洽），
 * 不是完整解码。带合法头、带终止标记但没有图像数据的文件仍会被接受——
 * 这一限制由下面的 `JPEG_HEADER_ONLY_WITH_EOI` 用例显式固定，避免后来者误以为
 * 「通过校验」等于「一定能渲染」。存储侧仍是受控 key + 受控 content type，
 * 残留影响只是图片渲染失败，不构成跨用户读取或可执行内容。
 */

const JPEG_BYTES = [
  255, 216, 255, 219, 0, 67, 0, 3, 2, 2, 3, 2, 2, 3, 3, 3, 3, 4, 3, 3, 4, 5, 8, 5, 5, 4,
  4, 5, 10, 7, 7, 6, 8, 12, 10, 12, 12, 11, 10, 11, 11, 13, 14, 18, 16, 13, 14, 17, 14, 11,
  11, 16, 22, 16, 17, 19, 20, 21, 21, 21, 12, 15, 23, 24, 22, 20, 24, 18, 20, 21, 20, 255,
  219, 0, 67, 1, 3, 4, 4, 5, 4, 5, 9, 5, 5, 9, 20, 13, 11, 13, 20, 20, 20, 20, 20, 20, 20,
  20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20,
  20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 255,
  192, 0, 17, 8, 0, 1, 0, 1, 3, 1, 34, 0, 2, 17, 1, 3, 17, 1, 255, 196, 0, 21, 0, 1, 1,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 255, 196, 0, 20, 16, 1, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 196, 0, 21, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 7, 9, 255, 196, 0, 20, 17, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 255, 218, 0, 12, 3, 1, 0, 2, 17, 3, 17, 0, 63, 0, 157, 0, 6, 42, 155, 255, 217,
];

const PNG_BYTES = [
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2,
  0, 0, 0, 144, 119, 83, 222, 0, 0, 0, 9, 112, 72, 89, 115, 0, 0, 3, 232, 0, 0, 3, 232, 1,
  181, 123, 82, 107, 0, 0, 0, 12, 73, 68, 65, 84, 8, 153, 99, 248, 207, 192, 0, 0, 3, 1, 1,
  0, 156, 227, 191, 89, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
];

const WEBP_BYTES = [
  82, 73, 70, 70, 60, 0, 0, 0, 87, 69, 66, 80, 86, 80, 56, 32, 48, 0, 0, 0, 208, 1, 0, 157,
  1, 42, 1, 0, 1, 0, 1, 64, 38, 37, 160, 2, 116, 186, 1, 248, 0, 3, 176, 0, 254, 242, 235,
  127, 252, 216, 21, 205, 115, 239, 247, 255, 210, 224, 253, 46, 15, 210, 224, 255, 210,
  144, 0, 0,
];

function toBuffer(bytes: number[]): Buffer {
  return Buffer.from(Uint8Array.from(bytes));
}

export const MINIMAL_JPEG = toBuffer(JPEG_BYTES);
export const MINIMAL_PNG = toBuffer(PNG_BYTES);
export const MINIMAL_WEBP = toBuffer(WEBP_BYTES);

/** 每个允许格式配一份真实字节与声明 MIME，用于「合法三种格式仍保存」的对照。 */
export const VALID_IMAGE_FIXTURES = [
  { mimeType: "image/jpeg", name: "photo.jpg", bytes: MINIMAL_JPEG },
  { mimeType: "image/png", name: "photo.png", bytes: MINIMAL_PNG },
  { mimeType: "image/webp", name: "photo.webp", bytes: MINIMAL_WEBP },
] as const;

/** 构造一个内容为真实图片字节的 File。 */
export function makeImageFile(bytes: Buffer, name: string, type: string): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

/** 声明成图片、内容却不是的伪造体：只查 `File.type` 的旧实现会放行。 */
export function makeForgedImageFile(name = "payload.jpg", type = "image/jpeg"): File {
  return new File(["this is definitely not an image"], name, { type });
}

/** 砍掉 JPEG 的 EOI：头仍合法，但文件不完整。 */
export const JPEG_WITHOUT_EOI = MINIMAL_JPEG.subarray(0, MINIMAL_JPEG.length - 2);
/** 砍掉 PNG 的 IEND 数据块。 */
export const PNG_WITHOUT_IEND = MINIMAL_PNG.subarray(0, MINIMAL_PNG.length - 12);
/** 只保留 WebP 的 RIFF/WEBP/VP8 四段标识，长度远小于 RIFF 声明值。 */
export const WEBP_TRUNCATED_RIFF = MINIMAL_WEBP.subarray(0, 16);

/** 有合法 JPEG 头与 EOI、但没有图像数据——magic bytes 契约放行，完整解码会失败。 */
export const JPEG_HEADER_ONLY_WITH_EOI = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00,
  0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]);
