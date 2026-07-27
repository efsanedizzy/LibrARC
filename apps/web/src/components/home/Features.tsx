import { Container } from "../layout/Container";
import { Card } from "../ui/Card";

const features = [
  {
    eyebrow: "Discovery",
    title: "Trending signal boards",
    description:
      "Monitor breakout tokens, watch momentum shifts, and jump into token detail routes without leaving the homepage."
  },
  {
    eyebrow: "Creators",
    title: "Launch-first workflows",
    description:
      "Push users toward the existing launch route with clear calls to action that fit the rest of the launchpad shell."
  },
  {
    eyebrow: "Profiles",
    title: "Connected creator identity",
    description:
      "Keep profile access visible so traders can move from market discovery to creator context in one tap."
  }
];

export function Features() {
  return (
    <section aria-labelledby="features-title" className="py-16 sm:py-20" id="features">
      <Container>
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-100/70">
            Platform features
          </p>
          <h2
            className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl"
            id="features-title"
          >
            Built for fast-moving launch cycles.
          </h2>
          <p className="mt-4 text-base leading-7 text-slate-400">
            The interface stays focused on discovery, launch actions, and route-level navigation
            while keeping everything static and implementation-safe.
          </p>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {features.map((feature) => (
            <article key={feature.title}>
              <Card className="h-full">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100/70">
                  {feature.eyebrow}
                </p>
                <h3 className="mt-4 text-2xl font-semibold tracking-tight text-white">
                  {feature.title}
                </h3>
                <p className="mt-4 text-sm leading-7 text-slate-400">{feature.description}</p>
              </Card>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
