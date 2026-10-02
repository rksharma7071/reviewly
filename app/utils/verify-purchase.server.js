import { unauthenticated } from "../shopify.server";

export async function verifyPurchase({ shop, email, productId }) {
    if (!shop || !email || !productId) return false;

    const { admin } = await unauthenticated.admin(shop);
    const safeEmail = String(email).replace(/["\\]/g, "");
    const safePid = String(productId).replace(/\D/g, "");
    const query = `email:"${safeEmail}" product_id:${safePid} financial_status:paid`;

    const response = await admin.graphql(
        `#graphql
      query VerifyPurchase($query: String!) {
        orders(first: 1, query: $query) {
          edges { node { id name createdAt } }
        }
      }
    `,
        { variables: { query } }
    );

    const parsed = await response.json();
    return (parsed?.data?.orders?.edges?.length ?? 0) > 0;
}