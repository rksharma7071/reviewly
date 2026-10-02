import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  switch (topic) {
    case "PRODUCTS_CREATE":
    case "PRODUCTS_UPDATE":
      await upsertProduct(shop, payload);
      break;

    case "PRODUCTS_DELETE":
      await deleteProduct(shop, payload);
      break;

    default:
      throw new Response("Unhandled webhook topic", { status: 404 });
  }

  return new Response(null, { status: 200 });
};

async function upsertProduct(shop, payload) {
  const product = payload;

  const imageUrl = product.images?.[0]?.src || null;

  await db.product.upsert({
    where: {
      shop_productId: {
        shop,
        productId: String(product.id),
      },
    },
    update: {
      title: product.title,
      handle: product.handle,
      description: product.body_html,
      vendor: product.vendor,
      productType: product.product_type,
      imageUrl,
      status: product.status,
      syncedAt: new Date(),
    },
    create: {
      shop,
      productId: String(product.id),
      title: product.title,
      handle: product.handle,
      description: product.body_html,
      vendor: product.vendor,
      productType: product.product_type,
      imageUrl,
      status: product.status,
      syncedAt: new Date(),
    },
  });
}

async function deleteProduct(shop, payload) {
  await db.product.deleteMany({
    where: {
      shop,
      productId: String(payload.id),
    },
  });
}