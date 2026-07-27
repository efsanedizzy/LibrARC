import { LaunchForm } from "../../components/launch/LaunchForm";
import { Container } from "../../components/layout/Container";

export default function LaunchPage() {
  return (
    <main className="flex-1 py-16 sm:py-20">
      <Container className="space-y-10">
        <section className="max-w-3xl">
          <p className="inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-100">
            Arc launch builder
          </p>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Prepare your token launch with a guided, review-first flow.
          </h1>
          <p className="mt-5 text-base leading-8 text-slate-300">
            Build the token metadata, preview media, optional social links, and launch summary
            before smart contract deployment is enabled on Arc Testnet.
          </p>
        </section>

        <LaunchForm />
      </Container>
    </main>
  );
}
