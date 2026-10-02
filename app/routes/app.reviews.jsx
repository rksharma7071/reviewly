import { useLoaderData, useSubmit, useNavigation, useNavigate } from "react-router";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  Badge,
  Text,
  Button,
  ButtonGroup,
  BlockStack,
  EmptySearchResult,
} from "@shopify/polaris";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const reviews = await db.review.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    include: { product: true },
    take: 100,
  });

  // Find products that have "Unknown Product" as title
  const unknownProductIds = [...new Set(
    reviews
      .filter((r) => r.product && r.product.title === "Unknown Product")
      .map((r) => r.product.productId)
  )];

  if (unknownProductIds.length > 0 && admin) {
    try {
      const gids = unknownProductIds.map((id) => `"gid://shopify/Product/${id}"`).join(", ");
      const response = await admin.graphql(`
        query {
          nodes(ids: [${gids}]) {
            ... on Product {
              id
              title
            }
          }
        }
      `);
      const data = await response.json();
      
      const updates = [];
      if (data?.data?.nodes) {
        for (const node of data.data.nodes) {
          if (node && node.id && node.title) {
            const numericId = node.id.split("/").pop();
            updates.push(
              db.product.updateMany({
                where: { shop, productId: numericId },
                data: { title: node.title },
              })
            );
            // Update in-memory for immediate display
            reviews.forEach((r) => {
              if (r.product && r.product.productId === numericId) {
                r.product.title = node.title;
              }
            });
          }
        }
        if (updates.length > 0) {
          await Promise.all(updates);
        }
      }
    } catch (err) {
      console.error("Failed to fetch product titles from Shopify", err);
    }
  }

  return { reviews };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const id = formData.get("id");
  const actionType = formData.get("action");

  if (!id || !actionType) return null;

  if (actionType === "approve") {
    await db.review.update({
      where: { id: String(id), shop },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
  } else if (actionType === "reject") {
    await db.review.update({
      where: { id: String(id), shop },
      data: { status: "REJECTED" },
    });
  } else if (actionType === "delete") {
    await db.review.delete({
      where: { id: String(id), shop },
    });
  }

  return { success: true };
};

export default function ReviewsPage() {
  const { reviews } = useLoaderData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const isSubmitting = navigation.state === "submitting";

  const handleAction = (id, action) => {
    submit({ id, action }, { method: "POST" });
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "PUBLISHED":
      case "FEATURED":
        return <Badge tone="success">Published</Badge>;
      case "PENDING":
        return <Badge tone="warning">Pending</Badge>;
      case "REJECTED":
        return <Badge tone="critical">Rejected</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const rowMarkup = reviews.map(
    (
      { id, authorName, rating, title, body, status, createdAt, product },
      index
    ) => (
      <IndexTable.Row 
        id={id} 
        key={id} 
        position={index}
        onClick={() => navigate(`/app/reviews/${id}`)}
      >
        <IndexTable.Cell>
          <Text variant="bodyMd" fontWeight="bold" as="span">
            {product?.title || "Unknown Product"}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text variant="bodyMd" as="span">
            {rating} / 5
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>{authorName}</IndexTable.Cell>
        <IndexTable.Cell>
          <BlockStack gap="100">
            {title && <Text variant="bodySm" fontWeight="bold">{title}</Text>}
            <Text variant="bodySm" as="span" tone="subdued">
              {body.length > 50 ? `${body.substring(0, 50)}...` : body}
            </Text>
          </BlockStack>
        </IndexTable.Cell>
        <IndexTable.Cell>{getStatusBadge(status)}</IndexTable.Cell>
        <IndexTable.Cell>
          {new Date(createdAt).toLocaleDateString()}
        </IndexTable.Cell>
        <IndexTable.Cell>
          <ButtonGroup>
            {status === "PENDING" && (
              <>
                <Button
                  size="micro"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAction(id, "approve");
                  }}
                  disabled={isSubmitting}
                >
                  Approve
                </Button>
                <Button
                  size="micro"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAction(id, "reject");
                  }}
                  disabled={isSubmitting}
                >
                  Reject
                </Button>
              </>
            )}
            {status === "PUBLISHED" && (
              <Button
                size="micro"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAction(id, "reject");
                }}
                disabled={isSubmitting}
              >
                Hide
              </Button>
            )}
            {status === "REJECTED" && (
              <Button
                size="micro"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAction(id, "approve");
                }}
                disabled={isSubmitting}
              >
                Publish
              </Button>
            )}
            <Button
              size="micro"
              tone="critical"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm("Are you sure you want to delete this review?")) {
                  handleAction(id, "delete");
                }
              }}
              disabled={isSubmitting}
            >
              Delete
            </Button>
          </ButtonGroup>
        </IndexTable.Cell>
      </IndexTable.Row>
    )
  );

  return (
    <Page title="Reviews">
      <Layout>
        <Layout.Section>
          <Card padding="0">
            <IndexTable
              resourceName={{ singular: "review", plural: "reviews" }}
              itemCount={reviews.length}
              headings={[
                { title: "Product" },
                { title: "Rating" },
                { title: "Author" },
                { title: "Review" },
                { title: "Status" },
                { title: "Date" },
                { title: "Actions" },
              ]}
              selectable={false}
              emptyState={
                <EmptySearchResult
                  title="No reviews yet"
                  description="When customers leave reviews, they will appear here."
                  withIllustration
                />
              }
            >
              {rowMarkup}
            </IndexTable>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
