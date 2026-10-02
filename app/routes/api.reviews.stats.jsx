import { data } from "react-router";
import db from "../db.server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop      = url.searchParams.get("shop");
  const productId = url.searchParams.get("productId");

  if (!shop || !productId) {
    return data({ average: 0, count: 0 }, { status: 400 });
  }

  const agg = await db.review.aggregate({
    where: {
      shop,
      productId: String(productId),
      status: { in: ["PUBLISHED", "FEATURED"] },
    },
    _avg: { rating: true },
    _count: { _all: true },
  });

  return data({
    average: Number((agg._avg.rating ?? 0).toFixed(2)),
    count: agg._count._all ?? 0,
  });
};