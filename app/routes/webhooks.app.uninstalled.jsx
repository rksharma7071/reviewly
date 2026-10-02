import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { shop, session, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  await db.shop.updateMany({
    where: { domain: shop },
    data: { isActive: false, uninstalledAt: new Date() },
  });

  return new Response();
};