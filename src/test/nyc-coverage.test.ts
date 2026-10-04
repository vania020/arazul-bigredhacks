import { describe, expect, it } from "vitest";
import {
  isPathInsideCoverage,
  isPointInsideCoverage,
  validateCoverageGeoJSON,
} from "../services/nycCoverage";
const coverage = validateCoverageGeoJSON({
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
describe("NYC coverage geometry guard", () => {
  it("distinguishes uncovered areas from zero-report cells", () => {
    expect(isPointInsideCoverage({ lng: 0.5, lat: 0.5 }, coverage)).toBe(true);
    expect(isPointInsideCoverage({ lng: 4, lat: 1 }, coverage)).toBe(false);
  });
  it("rejects segments crossing an uncovered hole despite covered endpoints", () => {
    expect(
      isPathInsideCoverage(
        [
          { lng: 0.5, lat: 1.5 },
          { lng: 2.5, lat: 1.5 },
        ],
        coverage,
      ),
    ).toBe(false);
    expect(
      isPathInsideCoverage(
        [
          { lng: 0.5, lat: 0.5 },
          { lng: 2.5, lat: 0.5 },
        ],
        coverage,
      ),
    ).toBe(true);
  });
  it("accepts a shared border between adjacent boroughs", () => {
    const adjacent = validateCoverageGeoJSON({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1],
                [0, 0],
              ],
            ],
          },
        },
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [1, 0],
                [2, 0],
                [2, 1],
                [1, 1],
                [1, 0],
              ],
            ],
          },
        },
      ],
    });
    expect(
      isPathInsideCoverage(
        [
          { lng: 0.5, lat: 0.5 },
          { lng: 1.5, lat: 0.5 },
        ],
        adjacent,
      ),
    ).toBe(true);
  });
  it("rejects malformed geometry and empty paths", () => {
    expect(() => validateCoverageGeoJSON({ type: "FeatureCollection", features: [] })).toThrow();
    expect(isPathInsideCoverage([], coverage)).toBe(false);
  });
});
