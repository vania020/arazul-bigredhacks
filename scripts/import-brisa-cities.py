#!/usr/bin/env python3
"""Convert existing Brisa aggregate packages, offline; no report/graph export."""
import argparse
import hashlib
import json
import math
from pathlib import Path

PACKAGES = [('nyc', 'nyc-manhattan', 'nyc'), ('chicago', 'chicago-loop', 'chicago'), ('san-francisco', 'sf-downtown', 'sf')]


def convert(root, city_id, package, config_name):
    raw = (root / 'public/data' / (package + '.json')).read_bytes()
    source = json.loads(raw)
    config = json.loads((root / 'configs/cities' / (config_name + '.json')).read_text())
    manifest = source['manifest']
    bounds = manifest['planningBounds']
    assert bounds == config['bounds']
    ref_lat = config.get('gridReferenceLatitude', (bounds[1] + bounds[3]) / 2)
    size = manifest['cellSizeMeters']
    dx, dy = size / (111320 * math.cos(math.radians(ref_lat))), size / 111320
    west, south, east, north = manifest['incidentBounds']
    cols, rows = round((east - west) / dx), round((north - south) / dy)
    cells = {}
    for cell in source['cells']:
        x, y = map(int, cell['id'].split(':'))
        assert 0 <= x < cols and 0 <= y < rows
        expected = [west + x * dx, south + y * dy, west + (x + 1) * dx, south + (y + 1) * dy]
        assert all(abs(a-b) < 1e-10 for a, b in zip(cell['bounds'], expected))
        intensity = cell['intensity']
        assert len(intensity) == 4 and all(math.isfinite(v) and 0 <= v <= 1 for v in intensity)
        key = f'{y}_{x}'
        assert key not in cells
        cells[key] = {'walking': intensity, 'driving': intensity.copy()}
    assert len(cells) == rows * cols
    assert sum(c['total'] for c in source['cells']) == manifest['eligibleReportCount']
    assert manifest['sourceReportCount'] == manifest['eligibleReportCount'] + manifest['excludedReportCount']
    # Keep source-specific statistical limitations; graph details do not apply here.
    limitations = [n for n in manifest['notes'] if not n.startswith(('OSM ', 'OpenStreetMap ', 'Landmarks ', 'Kept largest', 'Source query'))]
    limitations.append('Walking only. The driving array mirrors walking solely for legacy shape compatibility; driving exposure is unsupported.')
    meta = dict(cellSizeM=size, originLat=south, originLon=west, rows=rows, cols=cols,
                buckets=manifest['timeBuckets'], modes=['walking'], source=manifest['sourceName'],
                period=f"{manifest['periodStart']} to {manifest['periodEnd']}", incidentsUsed=manifest['eligibleReportCount'],
                cityId=city_id, coverageBounds=bounds, projectionLatitude=ref_lat,
                sourceUrl=manifest['sourceUrl'], timeResolution='six-hour', dataAsOf=manifest['downloadedAt'],
                timezone=manifest['timezone'], displayScale=24, sourceReportCount=manifest['sourceReportCount'],
                excludedReportCount=manifest['excludedReportCount'], missingCoordinateCount=manifest['missingCoordinateCount'],
                sourceDatasetId=package, sourcePackageSha256=hashlib.sha256(raw).hexdigest(),
                sourceModelVersion=manifest['modelVersion'], normalization=manifest['normalization'],
                methodology='Imported existing Brisa normalized activity index without reweighting: equal category weights, shrink20, cross smoothing (0.5 center, 0.125 each cardinal neighbor), then v/(v + package p90 positive-activity normalization). Original four local six-hour values preserved exactly. No SSP severity weights applied.',
                limitations=limitations)
    result = {'meta': meta, 'cells': cells, 'isDemo': False}
    for cell in source['cells']:
        x, y = cell['id'].split(':')
        assert result['cells'][f'{y}_{x}']['walking'] == cell['intensity']
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--brisa-root', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, default=Path(__file__).resolve().parents[1] / 'public/data')
    parser.add_argument('--check', action='store_true', help='Verify checked-in outputs instead of writing')
    args = parser.parse_args()
    if not args.check:
        args.output_dir.mkdir(parents=True, exist_ok=True)
    for city_id, package, config_name in PACKAGES:
        result = convert(args.brisa_root, city_id, package, config_name)
        path = args.output_dir / (city_id + '.json')
        if args.check:
            assert json.loads(path.read_text()) == result, f'Stale output: {path}'
        else:
            path.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
        meta = result['meta']
        print(f"{city_id}: {meta['rows']}x{meta['cols']}, {meta['incidentsUsed']} eligible / {meta['sourceReportCount']} source; all intensity values and geometry verified")


if __name__ == '__main__':
    main()
