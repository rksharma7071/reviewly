import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { shop } = await authenticate.webhook(request);
  await db.review.deleteMany({ where: { shop } });
  await db.product.deleteMany({ where: { shop } });
  await db.setting.deleteMany({ where: { shop } });
  await db.shop.deleteMany({ where: { domain: shop } });
  return new Response(null, { status: 200 });
};