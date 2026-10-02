import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { shop, payload } = await authenticate.webhook(request);
  const email = payload?.customer?.email;

  if (email) {
    await db.review.deleteMany({ where: { shop, authorEmail: email } });
  }
  return new Response(null, { status: 200 });
};