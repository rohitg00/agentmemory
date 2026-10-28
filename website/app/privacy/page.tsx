import type { Metadata } from "next";
import { DocPage, Prose } from "@/components/site/Doc";

export const metadata: Metadata = {
  title: "Privacy",
  description: "agentmemory runs on your computer. No account, no hosted service, no analytics, no telemetry.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <DocPage
      eyebrow="Privacy"
      title="Privacy"
      lede="agentmemory is open-source software that runs on your computer. There is no account, no hosted service and no analytics."
    >
      <Prose>
        <p>
          <strong>What it stores.</strong> Memories, and the agent activity you choose to capture, are saved in a data folder on your machine, for example{" "}
          <code>~/Library/Application Support/agentmemory</code> on macOS. You can export or delete them at any time.
        </p>
        <p>
          <strong>What leaves your machine.</strong> Memory text stays local with keyless search or local models.
          Configured remote services receive the text they process, under their own privacy policies.
          Installation, updates and the first local model download require network access.
        </p>
        <p>
          <strong>Telemetry.</strong> None.
        </p>
        <p>
          <strong>Third parties.</strong> agentmemory itself never collects or receives your data. The tools you use with
          it, such as your coding agent, LLM and embedding providers, and the iii engine if you turn on its usage
          telemetry, may store data under their own policies.
        </p>
        <p>
          <strong>Contact.</strong>{" "}
          <a href="https://github.com/rohitg00/agentmemory/issues">github.com/rohitg00/agentmemory/issues</a>
        </p>
      </Prose>
    </DocPage>
  );
}
