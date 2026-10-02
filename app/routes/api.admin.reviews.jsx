import { data } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import cloudinary from "../utils/cloudinary.server";
import { recomputeProductRatings } from "../utils/ratings.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
    await authenticate.public.appProxy(request); 

  const shop = session.shop;

  const url = new URL(request.url);
  const status    = url.searchParams.get("status");
  const productId = url.searchParams.get("productId");
  const rating    = url.searchParams.get("rating");
  const search    = url.searchParams.get("search");
  const page      = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const perPage   = Math.min(100, Math.max(1, Number(url.searchParams.get("perPage") ?? "20")));

  const where = { shop };
  if (status)    where.status = status;
  if (productId) where.productId = String(productId);
  if (rating)    where.rating = Number(rating);
  if (search) {
    where.OR = [
      { authorName:  { contains: search, mode: "insensitive" } },
      { authorEmail: { contains: search, mode: "insensitive" } },
      { title:       { contains: search, mode: "insensitive" } },
      { body:        { contains: search, mode: "insensitive" } },
    ];
  }

  const [reviews, total] = await Promise.all([
    db.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      include: { product: { select: { id: true, title: true, handle: true } } },
    }),
    db.review.count({ where }),
  ]);

  return data({
    reviews,
    pagination: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
  });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const method = request.method;

  if (method === "DELETE") {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return data({ error: "Missing review id" }, { status: 400 });

    const review = await db.review.findFirst({
      where: { id, shop },
      select: { id: true, productRefId: true, media: true },
    });
    if (!review) return data({ error: "Review not found" }, { status: 404 });

    if (Array.isArray(review.media)) {
      for (const item of review.media) {
        if (!item?.publicId) continue;
        const resourceType = item.type === "VIDEO" ? "video" : "image";
        try {
          await cloudinary.uploader.destroy(item.publicId, {
            resource_type: resourceType,
            invalidate: true,
          });
        } catch (err) {
          console.error("[cloudinary delete]", item.publicId, err);
        }
      }
    }

    await db.review.delete({ where: { id } });
    await recomputeProductRatings(review.productRefId, shop);
    return data({ success: true });
  }

  if (method === "PUT") {
    const { id, action: reviewAction, merchantReply } = await request.json();
    if (!id) return data({ error: "Missing review id" }, { status: 400 });

    const existing = await db.review.findFirst({
      where: { id, shop },
      select: { productRefId: true, status: true, publishedAt: true },
    });
    if (!existing) return data({ error: "Review not found" }, { status: 404 });

    const patch = {};
    switch (reviewAction) {
      case "approve":
        patch.status = "PUBLISHED";
        if (!existing.publishedAt) patch.publishedAt = new Date();
        break;
      case "hide":
        patch.status = "HIDDEN";
        patch.publishedAt = null;
        break;
      case "feature":
        patch.status = "FEATURED";
        if (!existing.publishedAt) patch.publishedAt = new Date();
        break;
      case "unfeature":
        patch.status = "PUBLISHED";
        break;
      case "reply":
        if (typeof merchantReply !== "string" || merchantReply.trim() === "") {
          return data({ error: "merchantReply is required" }, { status: 400 });
        }
        patch.merchantReply = merchantReply.trim().slice(0, 2000);
        patch.repliedAt = new Date();
        break;
      default:
        return data({ error: "Unknown action" }, { status: 400 });
    }

    const updated = await db.review.update({ where: { id }, data: patch });

    if (["approve", "hide", "feature", "unfeature"].includes(reviewAction)) {
      await recomputeProductRatings(existing.productRefId, shop);
    }

    return data({ success: true, review: updated });
  }

  return data({ error: "Method not allowed" }, { status: 405 });
};