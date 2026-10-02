import db from "../db.server";

export async function bulkSyncProducts(admin, shop) {
  let cursor = null;
  let hasNext = true;

  while (hasNext) {
    const res = await admin.graphql(
      `#graphql
        query GetProducts($cursor: String) {
          products(first: 50, after: $cursor) {
            edges {
              cursor
              node {
                id title handle descriptionHtml vendor productType status
                images(first: 1) { edges { node { url } } }
              }
            }
            pageInfo { hasNextPage }
          }
        }`,
      { variables: { cursor } }
    );
    const json = await res.json();
    const edges = json.data.products.edges;

    for (const { node } of edges) {
      const numericId = node.id.split("/").pop();
      await db.product.upsert({
        where:  { shop_productId: { shop, productId: numericId } },
        create: {
          shop,
          productId: numericId,
          title: node.title,
          handle: node.handle,
          description: node.descriptionHtml,
          vendor: node.vendor,
          productType: node.productType,
          imageUrl: node.images.edges[0]?.node?.url || null,
          status: node.status,
          syncedAt: new Date(),
        },
        update: {
          title: node.title,
          handle: node.handle,
          description: node.descriptionHtml,
          vendor: node.vendor,
          productType: node.productType,
          imageUrl: node.images.edges[0]?.node?.url || null,
          status: node.status,
          syncedAt: new Date(),
        },
      });
    }

    hasNext = json.data.products.pageInfo.hasNextPage;
    cursor = edges[edges.length - 1]?.cursor ?? null;
  }
}