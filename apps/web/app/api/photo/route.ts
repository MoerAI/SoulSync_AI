export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const src = new URL(request.url).searchParams.get("src");
  if (!src || !process.env.SUPABASE_URL || !src.startsWith(process.env.SUPABASE_URL)) {
    return new Response(null, { status: 400 });
  }

  const upstream = await fetch(src);
  if (!upstream.ok) {
    return new Response(null, { status: 502 });
  }

  return new Response(await upstream.arrayBuffer(), {
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "image/jpeg",
      "cache-control": "private, max-age=600",
    },
  });
}
