import { redirect } from "react-router";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  
  if (url.searchParams.toString()) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  throw redirect("/app");
};

export default function App() {
  return null;
}
