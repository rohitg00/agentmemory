import { Nav } from "@/components/site/Nav";
import { Hero } from "@/components/site/Hero";
import { Proof } from "@/components/site/Proof";
import { Featured, InTheWild } from "@/components/site/InTheWild";
import { UseCases } from "@/components/site/UseCases";
import { ContextFunnel } from "@/components/site/ContextFunnel";
import { InfraTiles } from "@/components/site/InfraTiles";
import { MemoryScroll } from "@/components/site/MemoryScroll";
import { Benchmarks } from "@/components/site/Benchmarks";
import { Agents } from "@/components/site/Agents";
import { LocalFirst } from "@/components/site/LocalFirst";
import { Interfaces } from "@/components/site/Interfaces";
import { Faq } from "@/components/site/Faq";
import { Install } from "@/components/site/Install";
import { Footer } from "@/components/site/Footer";

export default function Page() {
  return (
    <>
      <Nav />
      <main id="top">
        <Hero />
        <Proof />
        <Featured />
        <UseCases />
        <ContextFunnel />
        <InfraTiles />
        <MemoryScroll />
        <InTheWild />
        <Benchmarks />
        <Agents />
        <LocalFirst />
        <Interfaces />
        <Faq />
        <Install />
      </main>
      <Footer />
    </>
  );
}
