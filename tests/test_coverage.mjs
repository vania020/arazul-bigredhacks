import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isPointInsideCoverage,
  isPathInsideCoverage,
  validateCoverageGeoJSON,
} from "../src/services/nycCoverage.ts";
const geo = validateCoverageGeoJSON(
  JSON.parse(readFileSync(new URL("../public/data/nyc-coverage.geojson", import.meta.url))),
);
for (const [name, lng, lat] of [
  ["Manhattan", -73.9857, 40.7484],
  ["Bronx", -73.9229, 40.827],
  ["Brooklyn", -73.9442, 40.6782],
  ["Queens", -73.7949, 40.7282],
  ["Staten Island", -74.1502, 40.5795],
]) {
  assert.ok(isPointInsideCoverage({ lng, lat }, geo), name + " covered");
}
assert.equal(
  isPointInsideCoverage({ lng: -74.0431, lat: 40.7178 }, geo),
  false,
  "Jersey City is not NYC",
);
assert.equal(
  isPathInsideCoverage(
    [
      { lng: -74.16, lat: 40.63 },
      { lng: -74.23, lat: 40.66 },
      { lng: -74.0, lat: 40.75 },
    ],
    geo,
  ),
  false,
  "route through NJ not covered",
);
assert.ok(
  isPathInsideCoverage(
    [
      { lng: -73.9933748, lat: 40.7510909 },
      { lng: -73.9775815, lat: 40.7522481 },
    ],
    geo,
  ),
  "Manhattan route covered",
);
const hole = validateCoverageGeoJSON({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [3, 0],
            [3, 3],
            [0, 3],
            [0, 0],
          ],
          [
            [1, 1],
            [2, 1],
            [2, 2],
            [1, 2],
            [1, 1],
          ],
        ],
      },
    },
  ],
});
assert.equal(
  isPathInsideCoverage(
    [
      { lng: 0.5, lat: 1.5 },
      { lng: 2.5, lat: 1.5 },
    ],
    hole,
  ),
  false,
);
console.log("Official five-borough coverage and full-segment coverage checks passed.");
