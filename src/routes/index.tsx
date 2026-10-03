import { createFileRoute } from "@tanstack/react-router";
import { I18nProvider } from "@/i18n";
import { CityProvider, useCity } from "@/context/CityContext";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ARAZUL — Navigate with more context" },
      {
        name: "description",
        content:
          "Compare routes by travel time and historical reported-incident exposure. Built for Latin American cities, starting with São Paulo.",
      },
      { property: "og:title", content: "ARAZUL — Navigate with more context" },
      {
        property: "og:description",
        content: "Route comparison that weighs travel time against reported-incident exposure.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <I18nProvider>
      <CityProvider>
        <CityApp />
      </CityProvider>
    </I18nProvider>
  );
}

function CityApp() {
  const { city } = useCity();
  return <AppShell key={city.id} />;
}
