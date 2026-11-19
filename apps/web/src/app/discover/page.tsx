import type { Metadata } from "next";
import LandingPage from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "Meet Mealog · A little more context for every meal",
  description: "A project for people with diabetes who use Dexcom. Record and recall past meals and their associated glucose trends to inform glucose management decisions from personal experience.",
};

export default function DiscoverPage() {
  return <LandingPage />;
}
