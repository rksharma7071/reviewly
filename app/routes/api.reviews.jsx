import { data } from "react-router";
import db from "../db.server";
import { verifyPurchase } from "../utils/verify-purchase.server";
import { authenticate } from "../shopify.server";

const MAX_MEDIA_ITEMS = 5;

export const loader = async ({ request }) => {
  await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const productId = url.searchParams.get("productId");
  const sort = url.searchParams.get("sort") || "recent";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const perPage = Math.min(50, Math.max(1, Number(url.searchParams.get("perPage") ?? "5")));

  if (!shop || !productId) {
    return data({ error: "shop and productId are required" }, { status: 400 });
  }

  const where = {
    shop,
    productId: String(productId),
    status: { in: ["PUBLISHED", "FEATURED"] },
  };

  let orderBy = { createdAt: "desc" };
  if (sort === "highest") orderBy = { rating: "desc" };
  if (sort === "lowest") orderBy = { rating: "asc" };

  const [rows, total, agg] = await Promise.all([
    db.review.findMany({
      where,
      orderBy,
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        authorName: true,
        title: true,
        body: true,
        rating: true,
        verifiedPurchase: true,
        media: true,
        merchantReply: true,
        repliedAt: true,
        publishedAt: true,
        createdAt: true,
      },
    }),
    db.review.count({ where }),
    db.review.aggregate({
      where,
      _avg: { rating: true },
      _count: { _all: true },
    }),
  ]);

  return data({
    reviews: rows,
    total,
    average: Number((agg._avg.rating ?? 0).toFixed(2)),
    count: agg._count._all ?? 0,
    pagination: { page, perPage, totalPages: Math.ceil(total / perPage) },
  });
};

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  const formData = await request.formData();

  const shop = formData.get("shop");
  const productId = formData.get("productId");
  const authorName = formData.get("authorName");
  const authorEmail = formData.get("authorEmail");
  const title = formData.get("title");
  const body = formData.get("body");
  const ratingRaw = formData.get("rating");
  const mediaRaw = formData.get("media");
  const honeypot = formData.get("website");

  if (honeypot) return data({ success: true });

  if (!shop || !productId || !authorName || !body || !ratingRaw) {
    return data({ error: "Missing required fields" }, { status: 400 });
  }

  if (String(authorName).length > 80) return data({ error: "Name too long" }, { status: 400 });
  if (String(body).length > 5000) return data({ error: "Body too long" }, { status: 400 });
  if (title && String(title).length > 120) return data({ error: "Title too long" }, { status: 400 });

  if (authorEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(authorEmail))) {
    return data({ error: "Invalid email" }, { status: 400 });
  }

  const rating = Number(ratingRaw);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return data({ error: "Rating must be 1–5" }, { status: 400 });
  }

  let product = await db.product.findUnique({
    where: { shop_productId: { shop, productId: String(productId) } },
    select: { id: true },
  });

  if (!product) {
    // If the product hasn't been synced to our DB yet, create a stub
    // The webhook will eventually update it with the correct title
    product = await db.product.create({
      data: {
        shop,
        productId: String(productId),
        title: "Unknown Product",
      },
      select: { id: true },
    });
  }

  if (authorEmail) {
    const recent = await db.review.findFirst({
      where: {
        shop,
        productId: String(productId),
        authorEmail: String(authorEmail),
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      select: { id: true },
    });
    if (recent) {
      return data({ error: "You've already reviewed this product recently." }, { status: 429 });
    }
  }

  let verifiedPurchase = false;
  if (authorEmail) {
    try {
      verifiedPurchase = await verifyPurchase({
        shop,
        email: String(authorEmail),
        productId: String(productId),
      });
    } catch (err) {
      console.error("[api.reviews] verifyPurchase failed:", err);
    }
  }

  let media = null;
  if (mediaRaw) {
    try {
      const parsed = JSON.parse(mediaRaw);
      if (Array.isArray(parsed)) {
        const cloudBase = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/`;
        media = parsed
          .filter((m) => m && typeof m.url === "string" && m.url.startsWith(cloudBase))
          .slice(0, MAX_MEDIA_ITEMS)
          .map((m) => ({
            url: m.url,
            type: m.type === "VIDEO" ? "VIDEO" : "IMAGE",
            publicId: m.publicId || null,
          }));
        if (media.length === 0) media = null;
      }
    } catch {
      media = null;
    }
  }

  const review = await db.review.create({
    data: {
      shop,
      productRefId: product.id,
      productId: String(productId),
      authorName: String(authorName).slice(0, 80),
      authorEmail: authorEmail ? String(authorEmail) : null,
      title: title ? String(title).slice(0, 120) : null,
      body: String(body).slice(0, 5000),
      rating,
      status: "PUBLISHED", // Set to PUBLISHED so it displays immediately
      verifiedPurchase,
      media,
      source: "STORE",
      publishedAt: new Date(),
    },
  });

  return data({
    success: true,
    reviewId: review.id,
    message: "Review submitted successfully.",
  });
};