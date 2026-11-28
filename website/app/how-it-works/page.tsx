import type { Metadata } from "next";
import { Nav } from "@/components/site/Nav";
import { Runtime } from "@/components/site/Runtime";
import { ContextFunnel } from "@/components/site/ContextFunnel";
import { Research } from "@/components/site/Research";
import { Scale } from "@/components/site/Scale";
import { Install } from "@/components/site/Install";
import { Footer } from "@/components/site/Footer";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "How it works",
  description: "What agentmemory captures, how it turns tool calls into memory, what your agent gets back, and how it scales.",
  alternates: { canonical: "/how-it-works" },
};

export default function Page() {
  return (
    <>
      <Nav />
      <main id="top">
        <Runtime />
        <ContextFunnel />
        <Research />
        <Scale />
        <Install />
      </main>
      <Footer />
    </>
  );
}
