import type { Metadata } from "next";
import { Nav } from "@/components/site/Nav";
import { Agents } from "@/components/site/Agents";
import { Install } from "@/components/site/Install";
import { Footer } from "@/components/site/Footer";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Supported agents",
  description: "Every coding agent agentmemory connects to, by native plugin, MCP server or REST API, with the command for each.",
  alternates: { canonical: "/agents" },
};

export default function Page() {
  return (
    <>
      <Nav />
      <main id="top">
        <Agents />
        <Install />
      </main>
      <Footer />
    </>
  );
}
