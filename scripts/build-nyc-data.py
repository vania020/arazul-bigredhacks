#!/usr/bin/env python3
"""Build Arazul NYC grid from official NYPD records; Python 3.10+, standard library only.
Default outputs are candidates; integration requires the NYC polygon coverage guard.
"""
import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone, date
import gzip
import hashlib
import json
import math
import os
from pathlib import Path
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://data.cityofnewyork.us'
DATASETS = ('qgea-i56i', '5uac-w243')
FIELDS = ('cmplnt_num','cmplnt_fr_dt','cmplnt_fr_tm','cmplnt_to_dt','cmplnt_to_tm',
          'rpt_dt','ky_cd','ofns_desc','pd_cd','pd_desc','law_cat_cd','crm_atpt_cptd_cd',
          'boro_nm','addr_pct_cd','prem_typ_desc','loc_of_occur_desc','juris_desc',
          'jurisdiction_code','latitude','longitude')
NULLS = ('', '(null)', 'null', 'NULL', 'UNKNOWN')

def clean(value):
    return None if value is None or str(value).strip() in NULLS else str(value).strip()

def code(value):
    value = clean(value)
    if value is None: return None
    try:
        num = float(value)
        if not math.isfinite(num) or num != int(num): return None
        return str(int(num))
    except ValueError: return None

def compact(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()

def sha(value): return hashlib.sha256(value).hexdigest()

def request_json(url):
    headers = {'User-Agent':'Arazul-NYC-native-converter/1.0'}
    if os.getenv('SOCRATA_APP_TOKEN'): headers['X-App-Token'] = os.environ['SOCRATA_APP_TOKEN']
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=180) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code not in (429,500,502,503,504) or attempt == 2: raise
        except (TimeoutError, urllib.error.URLError):
            if attempt == 2: raise
        time.sleep(2 ** attempt)
    raise RuntimeError('Request failed')

def query(dataset, **params):
    return request_json(BASE+'/resource/'+dataset+'.json?'+urllib.parse.urlencode(params))

def source_metadata(dataset):
    m = request_json(BASE+'/api/views/'+dataset+'.json')
    return {'id':m['id'],'name':m['name'],'rowsUpdatedAt':m.get('rowsUpdatedAt'),
            'columns':[{k:c.get(k) for k in ('fieldName','name','description','dataTypeName')}
                       for c in m['columns'] if not c['fieldName'].startswith(':')],
            'attachments':m.get('metadata',{}).get('attachments',[]),
            'customFields':m.get('metadata',{}).get('custom_fields',{})}

def fetch_source(dataset, policy, page_size):
    temporal = f"cmplnt_fr_dt >= '{policy['periodStart']}T00:00:00' AND cmplnt_fr_dt < '{policy['periodEndExclusive']}T00:00:00'"
    # Fetch ALL YTD records in the occurrence window. A later correction can move a
    # historic candidate OUT of the category/premise selection and must supersede it.
    where = temporal
    if dataset == 'qgea-i56i':
        codes = ','.join(policy['selectedKeyCodes'])
        places = ','.join("'"+p+"'" for p in policy['premisesAllowlist'])
        where += f' AND ky_cd in ({codes}) AND prem_typ_desc in ({places})'
    before = source_metadata(dataset)
    count = int(query(dataset, **{'$select':'count(*) as n','$where':where})[0]['n'])
    reports = query(dataset, **{'$select':'min(rpt_dt) as min_report,max(rpt_dt) as max_report,count(*) as n'})[0]
    rows = []
    for offset in range(0, count, page_size):
        page = query(dataset, **{'$select':','.join(FIELDS),'$where':where,
                                '$order':'cmplnt_num ASC','$limit':page_size,'$offset':offset})
        expected = min(page_size, count-offset)
        if len(page) != expected: raise ValueError('Short page; refusing truncated output')
        rows.extend(page)
        print(f'{dataset}: {len(rows)}/{count} rows',flush=True)
    after = source_metadata(dataset)
    count_after = int(query(dataset, **{'$select':'count(*) as n','$where':where})[0]['n'])
    if before['rowsUpdatedAt'] != after['rowsUpdatedAt'] or count != count_after:
        raise ValueError('Source changed during pagination; retry the download')
    ids = [clean(r.get('cmplnt_num')) for r in rows]
    if None in ids or len(set(ids)) != len(ids): raise ValueError('Missing or duplicate source complaint IDs')
    return {'datasetId':dataset,'metadata':before,'queryWhere':where,'order':'cmplnt_num ASC',
            'expectedRows':count,'actualRows':len(rows),'reportDateRange':reports,
            'recordsSha256':sha(compact(rows)),'rows':rows}

def fetch_snapshot(policy, page_size):
    sources = []
    for dataset in DATASETS:
        cache = ROOT/'private-data/nyc/download-cache'/f'{dataset}.json.gz'
        cached = read_snapshot(cache) if cache.exists() else None
        current_meta = source_metadata(dataset) if cached else None
        if (cached and cached.get('policySha256') == sha(compact(policy))
            and cached['metadata']['rowsUpdatedAt'] == current_meta['rowsUpdatedAt']
            and cached['recordsSha256'] == sha(compact(cached['rows']))):
            source = cached
            print(f'{dataset}: reusing verified source checkpoint',flush=True)
        else:
            source = fetch_source(dataset,policy,page_size)
            source['policySha256'] = sha(compact(policy))
            write_gzip(cache,compact(source))
        sources.append(source)
    id = policy['coverageDatasetId']
    boundary = request_json(BASE+'/resource/'+id+'.geojson?$limit=10')
    names = {f['properties']['boroname'].upper() for f in boundary['features']}
    if names != set(policy['boroughAllowlist']) or len(boundary['features']) != 5:
        raise ValueError('Expected exactly five official NYC borough polygons')
    return {'retrievedAt':datetime.now(timezone.utc).isoformat(),'policy':policy,
            'sources':sources,'coverage':boundary,'coverageMetadata':source_metadata(id)}

def merge_sources(snapshot):
    merged = {}
    replaced = 0
    for source in snapshot['sources']:
        rows = source['rows']
        if len(rows) != source['expectedRows'] or sha(compact(rows)) != source['recordsSha256']:
            raise ValueError('Source snapshot count/hash mismatch')
        local_ids = set()
        for row in rows:
            id = clean(row.get('cmplnt_num'))
            if not id or id in local_ids: raise ValueError('Missing/duplicate complaint ID in source')
            local_ids.add(id)
            if id in merged: replaced += 1
            merged[id] = {'datasetId':source['datasetId'],'raw':row}
    return [merged[k] for k in sorted(merged)], replaced

def date_value(value):
    value = clean(value)
    if not value: return None
    try:
        if '/' in value: return datetime.strptime(value,'%m/%d/%Y').date()
        return date.fromisoformat(value[:10])
    except ValueError: return None

def time_value(value):
    value = clean(value)
    if not value: return None
    try: return datetime.strptime(value,'%H:%M:%S').time()
    except ValueError: return None

def time_bucket(row):
    fd,ft = date_value(row.get('cmplnt_fr_dt')), time_value(row.get('cmplnt_fr_tm'))
    if not fd or not ft: return None,'missing_or_invalid_start'
    end_date,end_time = clean(row.get('cmplnt_to_dt')),clean(row.get('cmplnt_to_tm'))
    bucket = ft.hour//6
    if end_date is None and end_time is None: return bucket,None
    td,tt = date_value(end_date),time_value(end_time)
    if not td or not tt: return None,'incomplete_or_invalid_interval'
    if datetime.combine(td,tt) < datetime.combine(fd,ft): return None,'reversed_interval'
    if td != fd or tt.hour//6 != bucket: return None,'interval_crosses_date_or_bucket'
    return bucket,None

def all_points(geo):
    for feature in geo['features']:
        geometry = feature['geometry']
        polygons = geometry['coordinates'] if geometry['type']=='MultiPolygon' else [geometry['coordinates']]
        for polygon in polygons:
            for ring in polygon:
                yield from ring

def geometry(policy, coverage):
    points = list(all_points(coverage))
    bounds = [min(p[0] for p in points),min(p[1] for p in points),max(p[0] for p in points),max(p[1] for p in points)]
    dy = policy['cellSizeM']/111320
    dx = policy['cellSizeM']/(111320*math.cos(math.radians(policy['projectionLatitude'])))
    west,south,east,north = bounds
    origin_lon,origin_lat = west-policy['haloCells']*dx,south-policy['haloCells']*dy
    cols = math.ceil((east-west)/dx)+2*policy['haloCells']
    rows = math.ceil((north-south)/dy)+2*policy['haloCells']
    return bounds,origin_lon,origin_lat,dx,dy,rows,cols

def normalize(item, policy, bounds):
    raw = item['raw']
    r = {k:raw.get(k) for k in FIELDS} # Original codes/labels retained, never renamed into SSP crimes.
    ky,pd = code(raw.get('ky_cd')),code(raw.get('pd_cd'))
    group = ('grand_larceny_from_person' if ky=='109' and pd in policy['grandLarcenyFromPersonPdCodes']
             else {'105':'robbery','106':'felony_assault','344':'assault_3_and_related'}.get(ky))
    bucket,temporal_problem = time_bucket(raw)
    problems = []
    fd = date_value(raw.get('cmplnt_fr_dt'))
    if not fd or not (policy['periodStart']<=fd.isoformat()<policy['periodEndExclusive']): problems.append('outside_occurrence_window')
    if ky not in policy['selectedKeyCodes']: problems.append('other_category')
    elif ky=='109' and group is None: problems.append('grand_larceny_not_selected_from_person_subtype')
    # Label-code contradictions fail instead of silently remapping a changed taxonomy.
    if ky in policy['selectedKeyCodes'] and clean(raw.get('ofns_desc')) != policy['selectedKeyCodes'][ky]:
        problems.append('missing_or_changed_offense_label')
    if clean(raw.get('prem_typ_desc')) not in policy['premisesAllowlist']: problems.append('other_or_missing_premises')
    if clean(raw.get('boro_nm')) not in policy['boroughAllowlist']: problems.append('other_or_missing_borough')
    if clean(raw.get('crm_atpt_cptd_cd')) not in ('COMPLETED','ATTEMPTED'): problems.append('other_or_missing_completion_flag')
    try:
        lat,lon = float(raw.get('latitude')),float(raw.get('longitude'))
        if not math.isfinite(lat) or not math.isfinite(lon) or not (-90<=lat<=90 and -180<=lon<=180): raise ValueError()
        if not (bounds[0]<=lon<=bounds[2] and bounds[1]<=lat<=bounds[3]): problems.append('outside_nyc_bounding_rectangle')
    except (TypeError,ValueError):
        lat=lon=None; problems.append('missing_or_invalid_coordinates')
    if temporal_problem: problems.append(temporal_problem)
    return {'source':{'agency':'NYPD','datasetId':item['datasetId'],'complaintId':clean(raw.get('cmplnt_num'))},
            'native':r,'analysis':{'group':group,'latitude':lat,'longitude':lon,
            'occurrenceStartDate':fd.isoformat() if fd else None,'localSixHourBucket':bucket,
            'timezone':policy['timezone'],'eligible':not problems,'exclusions':problems}}

def build(snapshot):
    policy = snapshot['policy']
    coverage = snapshot['coverage']
    bounds,west,south,dx,dy,rows,cols = geometry(policy,coverage)
    merged,replaced = merge_sources(snapshot)
    normalized = [normalize(item,policy,bounds) for item in merged]
    counts = defaultdict(lambda:[0,0,0,0])
    by_borough,by_group,by_code,first,all_reasons = Counter(),Counter(),Counter(),Counter(),Counter()
    subtype_labels = defaultdict(set)
    totals = [0]*4
    eligible = 0
    for record in normalized:
        a,n = record['analysis'],record['native']
        if code(n['ky_cd'])=='109': subtype_labels[code(n['pd_cd'])].add(n['pd_desc'])
        if not a['eligible']:
            first[a['exclusions'][0]]+=1;all_reasons.update(a['exclusions']);continue
        eligible+=1
        row,col = math.floor((a['latitude']-south)/dy),math.floor((a['longitude']-west)/dx)
        if not (0<=row<rows and 0<=col<cols): raise ValueError('Point exceeds grid')
        b=a['localSixHourBucket'];counts[row,col][b]+=1;totals[b]+=1
        by_borough[n['boro_nm']]+=1;by_group[a['group']]+=1;by_code[code(n['ky_cd'])]+=1
    if not eligible: raise ValueError('No eligible records; refusing an empty real-data grid')
    prior = [n/eligible for n in totals]
    adjusted = {}
    for key,values in counts.items():
        n=sum(values);lam=n/(n+policy['temporalShrinkage'])
        adjusted[key]=[lam*v+(1-lam)*n*p for v,p in zip(values,prior)]
    smoothed = {}
    positives = []
    for r in range(rows):
        for c in range(cols):
            neighbors=[(r,c,.5),(r-1,c,.125),(r+1,c,.125),(r,c-1,.125),(r,c+1,.125)]
            neighbors=[(rr,cc,w) for rr,cc,w in neighbors if 0<=rr<rows and 0<=cc<cols]
            denominator=sum(w for _,_,w in neighbors)
            v=[sum(adjusted.get((rr,cc),(0,0,0,0))[b]*w for rr,cc,w in neighbors)/denominator for b in range(4)]
            smoothed[r,c]=v
            lon,lat=west+(c+.5)*dx,south+(r+.5)*dy
            if bounds[0]<=lon<=bounds[2] and bounds[1]<=lat<=bounds[3]: positives.extend(x for x in v if x>0)
    positives.sort();q=max(1,positives[math.ceil(.9*len(positives))-1])
    cells={f'{r}_{c}':{'walking':[round(x/(x+q),9) for x in values],
                          'driving':[round(x/(x+q),9) for x in values]} for (r,c),values in smoothed.items()}
    excluded=len(normalized)-eligible
    if eligible+sum(first.values()) != len(normalized): raise ValueError('Exclusion reconciliation failed')
    provenance={'retrievedAt':snapshot['retrievedAt'],'mergedRows':len(normalized),'supersededHistoricRows':replaced,
        'candidateQueryScope':'Historic: four key codes and two premises; YTD: all categories/premises in the occurrence window, allowing late reports and corrections.',
        'eligibleComplaints':eligible,'excludedMergedRows':excluded,'firstMatchingExclusionCounts':dict(sorted(first.items())),
        'allExclusionReasonCountsNonAdditive':dict(sorted(all_reasons.items())),
        'eligibleByBorough':dict(sorted(by_borough.items())),'eligibleByAnalyticalGroup':dict(sorted(by_group.items())),
        'eligibleByNativeKeyCode':dict(sorted(by_code.items())),'knownLocalBucketCounts':totals,
        'globalKnownBucketProportions':prior,'positiveSmoothedP90':q,
        'observedGrandLarcenyPdLabels':{str(k):sorted(v,key=lambda x:str(x)) for k,v in sorted(subtype_labels.items(),key=lambda x:str(x[0]))},
        'sourceSummaries':[{k:v for k,v in s.items() if k!='rows'} for s in snapshot['sources']],
        'snapshotCanonicalSha256':sha(compact(snapshot)),'policySha256':sha(compact(policy)),
        'coverageCanonicalSha256':sha(compact(coverage)),'coverageMetadata':snapshot['coverageMetadata']}
    meta={'cityId':'nyc','cellSizeM':policy['cellSizeM'],'originLat':south,'originLon':west,'projectionLatitude':policy['projectionLatitude'],
          'rows':rows,'cols':cols,'buckets':['Midnight–6 am','6 am–noon','Noon–6 pm','6 pm–midnight'],
          'modes':['walking'],'source':'NYPD Complaint Data Historic + Current YTD',
          'sourceUrl':BASE+'/Public-Safety/NYPD-Complaint-Data-Historic/qgea-i56i',
          'period':policy['periodStart']+' to '+str(date.fromisoformat(policy['periodEndExclusive']).fromordinal(date.fromisoformat(policy['periodEndExclusive']).toordinal()-1)),
          'incidentsUsed':eligible,'coverageBounds':bounds,'coverageGeojsonUrl':'/data/nyc-coverage.geojson',
          'requiresPolygonCoverageGuard':True,'timeResolution':'six-hour','timezone':policy['timezone'],
          'displayScale':24,'sourceModelVersion':policy['version'],'dataAsOf':snapshot['retrievedAt'],
          'normalization':q,'sourceReportCount':len(normalized),'excludedReportCount':excluded,
          'methodology':'Selected outdoor NYPD complaints; native key/PD codes and labels retained in the audit snapshot. Equal weights; no SSP severity, recency or driving factors. Local six-hour counts are shrunk toward NYC known-time proportions with n/(n+20); cross smoothing 0.5 center + 0.125 per cardinal neighbor; v/(v+NYC p90). Route scoring still blends 70% selected bucket + 30% daily average.',
          'limitations':[
              'Historical reported-crime activity, not a probability of harm or a crime rate. No population or pedestrian-footfall denominator. Zero eligible reports does not prove safety.',
              'All five NYC boroughs. The bounding rectangle includes areas outside NYC: polygon coverage must be enforced before scoring. Bridge segments inside NYC water boundaries may be covered; water cells do not constitute water safety evidence.',
              'Only STREET and PARK/PLAYGROUND premises for robbery, felony assault, assault 3 & related offenses, and selected grand-larceny-from-person subtypes. This is a selected outdoor-complaint index, not all crime; homicide, petit larceny, vehicle theft and other categories are not scored.',
              'Rape/sex-offense locations are assigned to precinct station houses; not used here. Other un-geocodable complaints can also be located at station houses without a reliable fallback flag. Residual spatial bias remains.',
              'Attempted murder is classified as felony assault by NYPD. No attempted-homicide or robbery-homicide label is manufactured. Multiple-offense complaints contain the most serious offense only.',
              'An outdoor premise does not prove a stranger attack, pedestrian victim, or danger to a passer-by; no victim/offender relationship field is inferred.',
              'Occurrence dates/times are local wall time, not UTC. Unknown, partial, reversed or cross-date/cross-bucket intervals are excluded from this time-specific index and counted in the audit. No fabricated hour is assigned. Source clock/transcription and DST inconsistencies may remain.',
              'Coordinates are approximate midblock locations. Parks/beaches can be located at bordering streets; geographic resolution is not exact-address precision.',
              '2025 occurrence window; report-date coverage differs by release. YTD late reports are included as available; later-reported crimes and future revisions may remain absent. This is not live data.',
              'Driving unsupported. Driving arrays mirror walking only for legacy schema compatibility; meta.modes excludes driving.',
              'Within-NYC normalization and analyst-selected equal weights/shrinkage/smoothing are model choices, not NYPD-endorsed measures. Scores and numerical improvement percentages must not be compared with São Paulo or other cities.',
              'This direct NYC model is a new documented preprocessing version, not a numerically identical reconstruction of the previous Brisa import. No changes are required to route recommendation thresholds or route-score mathematics.'
          ],'provenance':provenance}
    return {'meta':meta,'cells':cells,'isDemo':False},normalized,provenance

def read_snapshot(path):
    with gzip.open(path,'rt',encoding='utf-8') as f: return json.load(f)

def write_gzip(path,raw):
    path.parent.mkdir(parents=True,exist_ok=True)
    with path.open('wb') as out:
        with gzip.GzipFile(filename='',fileobj=out,mode='wb',mtime=0) as f:f.write(raw)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input',type=Path,help='Rebuild offline from a snapshot.json.gz')
    parser.add_argument('--output-root',type=Path,default=ROOT)
    parser.add_argument('--page-size',type=int,default=5000)
    args=parser.parse_args()
    if not (1<=args.page_size<=50000):parser.error('page-size must be 1..50000')
    policy=json.loads((ROOT/'config/nyc-policy.json').read_text())
    snapshot=read_snapshot(args.input) if args.input else fetch_snapshot(policy,args.page_size)
    if compact(snapshot['policy']) != compact(policy):raise ValueError('Snapshot policy differs from config; create a new snapshot for a new model version')
    grid,normalized,audit=build(snapshot)
    root=args.output_root
    for path,obj in [('public/data/nyc-native.json',grid),('public/data/nyc-coverage.geojson',snapshot['coverage']),('docs/nyc-audit.json',audit)]:
        p=root/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(compact(obj)+b'\n')
    write_gzip(root/'private-data/nyc/snapshot.json.gz',compact(snapshot))
    write_gzip(root/'private-data/nyc/normalized-complaints.jsonl.gz',b'\n'.join(compact(n) for n in normalized)+b'\n')
    print(json.dumps({'grid':'public/data/nyc-native.json','eligible':grid['meta']['incidentsUsed'],
                      'excluded':grid['meta']['excludedReportCount'],'rows':grid['meta']['rows'],'cols':grid['meta']['cols'],
                      'eligibleByBorough':audit['eligibleByBorough']},indent=2),flush=True)

if __name__=='__main__':main()
