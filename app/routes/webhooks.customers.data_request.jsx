import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { shop, payload } = await authenticate.webhook(request);
  const email = payload?.customer?.email;

  const reviews = email
    ? await db.review.findMany({
        where: { shop, authorEmail: email },
        select: { id: true, productId: true, rating: true, body: true, createdAt: true },
      })
    : [];

  console.log(`[GDPR data_request] shop=${shop} email=${email} reviews=${reviews.length}`);

  return new Response(null, { status: 200 });
};