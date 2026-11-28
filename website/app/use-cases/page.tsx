import type { Metadata } from "next";
import { Nav } from "@/components/site/Nav";
import { UseCases } from "@/components/site/UseCases";
import { InTheWild } from "@/components/site/InTheWild";
import { Install } from "@/components/site/Install";
import { Footer } from "@/components/site/Footer";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Use cases",
  description: "What teams and solo developers use agentmemory for, and where it is used in public projects.",
  alternates: { canonical: "/use-cases" },
};

export default function Page() {
  return (
    <>
      <Nav />
      <main id="top">
        <UseCases />
        <InTheWild />
        <Install />
      </main>
      <Footer />
    </>
  );
}
