import { ScrollProgress } from "@/components/ScrollProgress";
import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { FeaturedIn } from "@/components/FeaturedIn";
import { Stats } from "@/components/Stats";
import { Primitives } from "@/components/Primitives";
import { Features } from "@/components/Features";
import { CommandCenter } from "@/components/CommandCenter";
import { LiveTerminal } from "@/components/LiveTerminal";
import { Compare } from "@/components/Compare";
import { Agents } from "@/components/Agents";
import { Install } from "@/components/Install";
import { Footer } from "@/components/Footer";
import { getProjectMeta } from "@/lib/meta";

export default function Page() {
  const meta = getProjectMeta();
  return (
    <>
      <ScrollProgress />
      <Nav />
      <main id="top">
        <Hero />
        <FeaturedIn />
        <Stats
          mcpTools={meta.mcpTools}
          hooks={meta.hooks}
          testsPassing={meta.testsPassing}
        />
        <Primitives />
        <Features
          hooks={meta.hooks}
          mcpTools={meta.mcpTools}
          restEndpoints={meta.restEndpoints}
        />
        <CommandCenter />
        <LiveTerminal mcpTools={meta.mcpTools} hooks={meta.hooks} />
        <Compare />
        <Agents />
        <Install />
      </main>
      <Footer />
    </>
  );
}
