import { importLib } from "./googleMaps";
import type { LatLng } from "@/types/route";
export async function locationLabel(point: LatLng): Promise<string | null> {
  try {
    const { Geocoder } = await importLib<google.maps.GeocodingLibrary>("geocoding");
    const result = await new Geocoder().geocode({ location: point });
    return result.results[0]?.formatted_address ?? null;
  } catch {
    return null;
  }
}
