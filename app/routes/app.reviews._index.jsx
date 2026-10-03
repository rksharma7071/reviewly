import { useLoaderData, useSubmit, useNavigation, useNavigate, useSearchParams } from "react-router";
import { useState, useCallback, useEffect } from "react";
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
  TextField,
  Select,
  InlineStack,
  Box,
} from "@shopify/polaris";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status") || "all";
  const searchStr = url.searchParams.get("search") || "";

  const where = { shop };
  if (statusFilter !== "all") {
    where.status = statusFilter.toUpperCase();
  }
  if (searchStr) {
    where.OR = [
      { authorName: { contains: searchStr, mode: "insensitive" } },
      { authorEmail: { contains: searchStr, mode: "insensitive" } },
      { title: { contains: searchStr, mode: "insensitive" } },
      { body: { contains: searchStr, mode: "insensitive" } },
    ];
  }

  const reviews = await db.review.findMany({
    where,
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
  } else if (actionType === "unpublish") {
    await db.review.update({
      where: { id: String(id), shop },
      data: { status: "UNPUBLISHED" },
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
  const [searchParams, setSearchParams] = useSearchParams();
  const isSubmitting = navigation.state === "submitting" || navigation.state === "loading";

  const currentStatus = searchParams.get("status") || "all";
  const currentSearch = searchParams.get("search") || "";

  const [queryValue, setQueryValue] = useState(currentSearch);
  const [statusValue, setStatusValue] = useState(currentStatus);

  const handleStatusChange = useCallback(
    (value) => {
      setStatusValue(value);
      const newParams = new URLSearchParams(searchParams);
      if (value === "all") newParams.delete("status");
      else newParams.set("status", value);
      setSearchParams(newParams);
    },
    [searchParams, setSearchParams]
  );

  const handleFiltersQueryChange = useCallback(
    (value) => {
      setQueryValue(value);
    },
    []
  );

  const handleQuerySubmit = useCallback(() => {
    const newParams = new URLSearchParams(searchParams);
    if (queryValue) newParams.set("search", queryValue);
    else newParams.delete("search");
    setSearchParams(newParams);
  }, [queryValue, searchParams, setSearchParams]);

  const handleQueryClear = useCallback(() => {
    setQueryValue("");
    const newParams = new URLSearchParams(searchParams);
    newParams.delete("search");
    setSearchParams(newParams);
  }, [searchParams, setSearchParams]);

  const handleAction = (id, action) => {
    submit({ id, action }, { method: "POST" });
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "PUBLISHED":
      case "FEATURED":
        return <Badge tone="success">Published</Badge>;
      case "UNPUBLISHED":
        return <Badge tone="info">Unpublished</Badge>;
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
            )}
            {status === "PUBLISHED" && (
              <Button
                size="micro"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAction(id, "unpublish");
                }}
                disabled={isSubmitting}
              >
                Unpublish
              </Button>
            )}
            {(status === "REJECTED" || status === "UNPUBLISHED") && (
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
            {status !== "REJECTED" && (
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
            <Box padding="400">
              <InlineStack gap="400" align="start" blockAlign="center">
                <Box minWidth="300px">
                  <TextField
                    label="Search reviews"
                    labelHidden
                    value={queryValue}
                    onChange={handleFiltersQueryChange}
                    onClearButtonClick={handleQueryClear}
                    clearButton
                    placeholder="Search author, title, body..."
                    autoComplete="off"
                    connectedRight={
                      <Button onClick={handleQuerySubmit}>Search</Button>
                    }
                  />
                </Box>
                <Select
                  label="Status"
                  labelInline
                  options={[
                    { label: "All", value: "all" },
                    { label: "Pending", value: "pending" },
                    { label: "Published", value: "published" },
                    { label: "Unpublished", value: "unpublished" },
                    { label: "Rejected", value: "rejected" },
                  ]}
                  value={statusValue}
                  onChange={handleStatusChange}
                />
              </InlineStack>
            </Box>
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
