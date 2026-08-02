import { Container } from "../layout/Container";

const features = [
  {
    eyebrow: "Verified",
    title: "Factory-backed launch discovery",
    description:
      "Every Discover card still resolves against the active Arc Testnet registry instead of a mock feed."
  },
  {
    eyebrow: "Usable",
    title: "Readable cards with real signal",
    description:
      "Reserve depth, graduation progress, and buy or sell availability stay visible without overwhelming the page."
  },
  {
    eyebrow: "Fast",
    title: "Wallet-optional browsing",
    description:
      "The refreshed home page keeps browsing open to disconnected users while preserving the existing launch, token, and profile routes."
  }
];

export function Features() {
  return (
    <section aria-labelledby="features-title" className="pb-6 pt-6 sm:pb-8 sm:pt-8" id="features">
      <Container>
        <div className="surface-panel rounded-[var(--radius-xl)] px-6 py-8 sm:px-8 sm:py-10">
          <div className="max-w-3xl">
            <p className="eyebrow">Why this phase matters</p>
            <h2
              className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl"
              id="features-title"
            >
              The first redesign pass turns the technical MVP into a calmer launch surface.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)]">
              The working Arc flow stays exactly as it is. This phase focuses on trust, spacing,
              hierarchy, and a better reading experience for live Discover activity.
            </p>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {features.map((feature) => (
              <article
                className="surface-muted rounded-[var(--radius-lg)] px-5 py-5"
                key={feature.title}
              >
                <p className="eyebrow text-[var(--text-faint)]">{feature.eyebrow}</p>
                <h3 className="mt-4 text-xl font-semibold tracking-tight text-white">
                  {feature.title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">
                  {feature.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
