import { LaunchForm } from "../../components/launch/LaunchForm";
import { Container } from "../../components/layout/Container";

export default function LaunchPage() {
  return (
    <main className="flex-1 py-16 sm:py-20">
      <Container>
        <LaunchForm />
      </Container>
    </main>
  );
}
