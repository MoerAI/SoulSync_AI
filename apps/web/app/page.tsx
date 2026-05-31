import { Architecture } from "../components/landing/Architecture";
import { CoreDemo } from "../components/landing/CoreDemo";
import { Footer } from "../components/landing/Footer";
import { Hero } from "../components/landing/Hero";
import { HowItWorks } from "../components/landing/HowItWorks";
import { Nav } from "../components/landing/Nav";
import { Problem } from "../components/landing/Problem";
import { Solution } from "../components/landing/Solution";
import { Tools } from "../components/landing/Tools";
import { WidgetUX } from "../components/landing/WidgetUX";
import { WhyNow } from "../components/landing/WhyNow";

export default function HomePage() {
  return (
    <div className="landing-page">
      <Nav />
      <main>
        <Hero />
        <Problem />
        <Solution />
        <HowItWorks />
        <Architecture />
        <Tools />
        <WidgetUX />
        <CoreDemo />
        <WhyNow />
      </main>
      <Footer />
    </div>
  );
}
