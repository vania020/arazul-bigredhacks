import type { LatLng, LocationValue } from "@/types/route";
import type { TravelMode } from "@/types/risk";

export interface CityConfig {
  id: string;
  name: string;
  region: string;
  countryCode: string;
  timeZone: string;
  center: LatLng;
  zoom: number;
  searchRadiusM: number;
  defaultMode: TravelMode;
  datasetUrl: string | null;
  demo: { origin: LocationValue; destination: LocationValue };
}
const point = (label: string, lat: number, lng: number): LocationValue => ({
  label,
  latLng: { lat, lng },
});
export const CITIES: CityConfig[] = [
  {
    id: "sao-paulo",
    name: "São Paulo",
    region: "São Paulo metro grid",
    countryCode: "br",
    timeZone: "America/Sao_Paulo",
    center: { lat: -23.5505, lng: -46.6333 },
    zoom: 13,
    searchRadiusM: 50000,
    defaultMode: "driving",
    datasetUrl: "hosted-sao-paulo",
    demo: {
      origin: point("MASP · Avenida Paulista, São Paulo", -23.5614, -46.6559),
      destination: point("Praça da Sé, São Paulo", -23.5504, -46.6339),
    },
  },
  {
    id: "nyc",
    name: "New York City",
    region: "Central Manhattan",
    countryCode: "us",
    timeZone: "America/New_York",
    center: { lat: 40.7484, lng: -73.9857 },
    zoom: 14,
    searchRadiusM: 15000,
    defaultMode: "walking",
    datasetUrl: "/data/nyc.json",
    demo: {
      origin: point("Penn Station, Manhattan", 40.7510909, -73.9933748),
      destination: point("Grand Central Terminal, Manhattan", 40.7522481, -73.9775815),
    },
  },
  {
    id: "chicago",
    name: "Chicago",
    region: "Loop",
    countryCode: "us",
    timeZone: "America/Chicago",
    center: { lat: 41.8819, lng: -87.6302 },
    zoom: 15,
    searchRadiusM: 10000,
    defaultMode: "walking",
    datasetUrl: "/data/chicago.json",
    demo: {
      origin: point("Willis Tower, Chicago", 41.8788924, -87.6354813),
      destination: point("Chicago Riverwalk, Wacker Drive", 41.887116, -87.62953),
    },
  },
  {
    id: "san-francisco",
    name: "San Francisco",
    region: "Downtown",
    countryCode: "us",
    timeZone: "America/Los_Angeles",
    center: { lat: 37.79, lng: -122.406 },
    zoom: 14,
    searchRadiusM: 12000,
    defaultMode: "walking",
    datasetUrl: "/data/san-francisco.json",
    demo: {
      origin: point("Union Square, San Francisco", 37.7878403, -122.4074974),
      destination: point("Ferry Building, San Francisco", 37.7949204, -122.3942491),
    },
  },
  {
    id: "lima",
    name: "Lima",
    region: "Metropolitan Lima",
    countryCode: "pe",
    timeZone: "America/Lima",
    center: { lat: -12.1211, lng: -77.0305 },
    zoom: 13,
    searchRadiusM: 45000,
    defaultMode: "walking",
    datasetUrl: null,
    demo: {
      origin: point("Parque Kennedy, Miraflores, Lima", -12.1211, -77.0305),
      destination: point("Larcomar, Miraflores, Lima", -12.1316, -77.0301),
    },
  },
  {
    id: "london",
    name: "London",
    region: "Central London",
    countryCode: "gb",
    timeZone: "Europe/London",
    center: { lat: 51.514, lng: -0.124 },
    zoom: 14,
    searchRadiusM: 18000,
    defaultMode: "walking",
    datasetUrl: "/data/london.json",
    demo: {
      origin: point("Trafalgar Square, London", 51.508, -0.1281),
      destination: point("British Museum, London", 51.5194, -0.127),
    },
  },
];
export const DEFAULT_CITY = CITIES[0]!;
