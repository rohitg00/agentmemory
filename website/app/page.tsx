import { Nav } from "@/components/site/Nav";
import { Hero } from "@/components/site/Hero";
import { AgentMarquee } from "@/components/site/AgentMarquee";
import { Proof } from "@/components/site/Proof";
import { Featured } from "@/components/site/InTheWild";
import { InfraTiles } from "@/components/site/InfraTiles";
import { MemoryScroll } from "@/components/site/MemoryScroll";
import { Benchmarks } from "@/components/site/Benchmarks";
import { LocalFirst } from "@/components/site/LocalFirst";
import { Faq } from "@/components/site/Faq";
import { Install } from "@/components/site/Install";
import { Footer } from "@/components/site/Footer";

export const revalidate = 3600;

export default function Page() {
  return (
    <>
      <Nav />
      <main id="top">
        <Hero />
        <AgentMarquee />
        <Proof />
        <Featured />
        <InfraTiles />
        <MemoryScroll />
        <Benchmarks />
        <LocalFirst />
        <Faq />
        <Install />
      </main>
      <Footer />
    </>
  );
}
