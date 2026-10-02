import { data } from "react-router";
import crypto from "node:crypto";
import cloudinary, { CLOUDINARY_FOLDER } from "../utils/cloudinary.server";

const ALLOWED = {
  image: ["jpg", "jpeg", "png", "webp", "gif", "avif"],
  video: ["mp4", "mov", "webm", "m4v"],
};

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  const { filename, contentType, size } = await request.json();
  if (!filename || !contentType) {
    return data({ error: "filename and contentType are required" }, { status: 400 });
  }

  const resourceType = contentType.startsWith("video/") ? "video" : "image";
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED[resourceType].includes(ext)) {
    return data({ error: `Unsupported .${ext}` }, { status: 400 });
  }

  const maxSize = resourceType === "video" ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
  if (typeof size === "number" && size > maxSize) {
    return data({ error: "File too large" }, { status: 400 });
  }
  const publicId = crypto.randomUUID();
  const timestamp = Math.round(Date.now() / 1000);

  const paramsToSign = {
    timestamp,
    public_id: publicId,
    folder: CLOUDINARY_FOLDER,
  };

  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    process.env.CLOUDINARY_API_SECRET
  );

  return data({
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    timestamp,
    publicId,
    folder: CLOUDINARY_FOLDER,
    resourceType,
    signature,
    uploadUrl: `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
  });
};