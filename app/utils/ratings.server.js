import db from "../db.server";

export async function recomputeProductRatings(productRefId, shop) {
  const agg = await db.review.aggregate({
    where: {
      productRefId,
      shop,
      status: { in: ["PUBLISHED", "FEATURED"] },
    },
    _avg:   { rating: true },
    _count: { _all: true },
  });

  const publishedReviewCount = agg?._count?._all ?? 0;
  const averageRating = publishedReviewCount > 0
    ? Number((agg._avg.rating ?? 0).toFixed(2))
    : 0;

  await db.product.update({
    where: { id: productRefId },
    data: { averageRating, publishedReviewCount, reviewCount: publishedReviewCount },
  });
}

export async function recomputeProductRatingsForReview(reviewId, shop) {
  const review = await db.review.findFirst({
    where: { id: reviewId, shop },
    select: { productRefId: true },
  });
  if (review) await recomputeProductRatings(review.productRefId, shop);
}