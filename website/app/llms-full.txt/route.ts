import { llmsFullTxt } from "@/lib/llms";

export const dynamic = "force-static";

export function GET() {
  return new Response(llmsFullTxt(), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
