#!/usr/bin/env python3
"""Build privacy-aware London aggregates from the official monthly police API.
Raw records stay in memory; --input may point to a separately downloaded response.
"""
import argparse
import collections
import datetime
import hashlib
import json
import math
from pathlib import Path
import urllib.request

PERIOD = '2026-08'
BOUNDS = [-0.155, 51.495, -0.085, 51.535]
CELL = 200
ELIGIBLE = {'robbery', 'theft-from-the-person', 'violent-crime', 'public-order'}
SOURCE_URL = ('https://data.police.uk/api/crimes-street/all-crime?date=' + PERIOD
              + '&poly=51.495,-0.155:51.535,-0.155:51.535,-0.085:51.495,-0.085')
METHOD = ('Select robbery, theft-from-the-person, violent-crime and public-order, each with equal weight. '
          'Count anonymised points in 200m cells; smooth with the separable 3x3 [1,2,1] kernel divided by 16 '
          '(zero padding beyond coverage). Apply log1p and divide by the nearest-rank 95th percentile '
          'of positive log-smoothed values, clipping to [0,1]. This is a within-London spatial index, '
          'not a probability or a cross-city comparable rate. All four time slots contain the same all-day value.')
LIMITS = [
    'Monthly records have no incident hour: time-of-day differences cannot be inferred.',
    'Published locations are anonymised approximations; 200m cells do not restore incident precision.',
    'Recorded crime and ASB include reporting and policing biases and exclude unreported incidents.',
    'Selected categories are not necessarily outdoors or stranger offences; this is not a validated pedestrian danger model.',
    'No population, footfall, distance-travelled or exposure denominator is available.',
    'Coverage is only the stated central London rectangle, not all London; smoothing is truncated at its edge.',
    'Absence of published points is not evidence of safety; source omissions and subsequent revisions are possible.',
    'Driving is unsupported; the identical driving arrays exist only for legacy schema compatibility.',
    'Scores are normalized within this dataset and must not be compared numerically across cities.',
]

def build(raw):
    records = json.loads(raw)
    assert isinstance(records, list) and 0 < len(records) < 10000, 'Unexpected or potentially truncated API response'
    west, south, east, north = BOUNDS
    rows = math.ceil((north-south)*111320/CELL)
    cols = math.ceil((east-west)*111320*math.cos(math.radians(south))/CELL)
    counts = collections.Counter()
    categories = collections.Counter()
    seen = set()
    duplicates = outside = 0
    for item in records:
        assert item['month'] == PERIOD
        # Persistent IDs are blank for ASB. Never deduplicate by rounded location/category.
        key = ('persistent', item['persistent_id']) if item.get('persistent_id') else ('api', item['id'])
        if key in seen:
            duplicates += 1
            continue
        seen.add(key)
        lat, lon = float(item['location']['latitude']), float(item['location']['longitude'])
        if not (south <= lat <= north and west <= lon <= east):
            outside += 1
            continue
        row = math.floor((lat-south)*111320/CELL)
        col = math.floor((lon-west)*111320*math.cos(math.radians(south))/CELL)
        assert 0 <= row < rows and 0 <= col < cols
        categories[item['category']] += 1
        if item['category'] in ELIGIBLE:
            counts[row, col] += 1
    smoothed = {}
    for r in range(rows):
        for c in range(cols):
            value = sum(counts[r+dr,c+dc]*wr*wc for dr,wr in [(-1,1),(0,2),(1,1)]
                        for dc,wc in [(-1,1),(0,2),(1,1)])/16
            smoothed[r,c] = math.log1p(value)
    positives = sorted(x for x in smoothed.values() if x > 0)
    p95 = positives[math.ceil(.95*len(positives))-1]
    cells = {}
    for (r,c), value in smoothed.items():
        score = round(min(1,value/p95),6)
        cells[f'{r}_{c}'] = {'walking':[score]*4,'driving':[score]*4}
    return {'meta': {'cityId':'london','cellSizeM':CELL,'originLat':south,'originLon':west,
        'projectionLatitude':south,'displayScale':24,'rows':rows,'cols':cols,
        'buckets':['madrugada','manha','tarde','noite'],'modes':['walking'],
        'source':'data.police.uk — published street-level crime and anti-social behaviour',
        'sourceUrl':SOURCE_URL,'period':PERIOD,'incidentsUsed':sum(counts.values()),
        'coverageBounds':BOUNDS,'timeResolution':'all-day','timezone':'Europe/London',
        'methodology':METHOD,'limitations':LIMITS,
        'provenance':{'retrievedOn':datetime.date.today().isoformat(),'responseSha256':hashlib.sha256(raw).hexdigest(),
            'responseRecords':len(records),'duplicatesRemoved':duplicates,'outsideBoundsRemoved':outside,
            'categoryCounts':dict(sorted(categories.items())), 'eligibleCategories':sorted(ELIGIBLE),
            'excludedByCategory':sum(categories.values())-sum(counts.values()), 'positiveLogSmoothedP95':p95,
            'license':'Open Government Licence v3.0','apiPagination':'None; one polygon response below 10,000-record limit'}},
        'cells':cells,'isDemo':False}

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input',type=Path)
    parser.add_argument('--output',type=Path,default=Path(__file__).resolve().parents[1]/'public/data/london.json')
    args=parser.parse_args()
    raw=args.input.read_bytes() if args.input else urllib.request.urlopen(SOURCE_URL,timeout=90).read()
    result=build(raw)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(result,separators=(',',':'))+'\n')
    print(json.dumps({'output':str(args.output),'meta':result['meta'],'cells':len(result['cells'])},indent=2))
