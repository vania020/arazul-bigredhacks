#!/usr/bin/env python3
"""Query eligible published complaint points within a radius of a GeoJSON route.
Offline by default. Reported coordinates are approximate; geometric distance is
not the distance to the original undisclosed incident address. Does not change
Arazul's grid-based route scoring.
"""
import argparse
from collections import Counter
import importlib.util
import json
import math
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('nyc_converter',ROOT/'scripts/build-nyc-data.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
EARTH_RADIUS=6371008.8

def angular_distance(a,b):
    lon1,lat1,lon2,lat2=map(math.radians,[a[0],a[1],b[0],b[1]])
    h=math.sin((lat2-lat1)/2)**2+math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return 2*math.asin(min(1,math.sqrt(h)))

def bearing(a,b):
    lon1,lat1,lon2,lat2=map(math.radians,[a[0],a[1],b[0],b[1]])
    return math.atan2(math.sin(lon2-lon1)*math.cos(lat2),
                     math.cos(lat1)*math.sin(lat2)-math.sin(lat1)*math.cos(lat2)*math.cos(lon2-lon1))

def point_segment_m(p,a,b):
    d12=angular_distance(a,b)
    if d12<1e-15:return EARTH_RADIUS*angular_distance(p,a)
    d13=angular_distance(a,p);theta=bearing(a,p)-bearing(a,b)
    along=math.atan2(math.sin(d13)*math.cos(theta),math.cos(d13))
    if 0<=along<=d12:return EARTH_RADIUS*abs(math.asin(max(-1,min(1,math.sin(d13)*math.sin(theta)))))
    return EARTH_RADIUS*min(angular_distance(p,a),angular_distance(p,b))

def padded_bbox(route,radius):
    west,south,east,north=min(p[0] for p in route),min(p[1] for p in route),max(p[0] for p in route),max(p[1] for p in route)
    dy=math.degrees(radius/EARTH_RADIUS)
    dx=dy/math.cos(math.radians(max(abs(south-dy),abs(north+dy))))
    return west-dx,south-dy,east+dx,north+dy

def route_coordinates(value):
    if value.get('type')=='Feature':value=value['geometry']
    if value.get('type')!='LineString':raise ValueError('Provide one GeoJSON LineString with [longitude,latitude] coordinates')
    route=value['coordinates']
    if len(route)<2 or any(len(p)<2 or not all(math.isfinite(x) for x in p[:2]) or not(-74.5<=p[0]<=-73.5 and 40.3<=p[1]<=41.1) for p in route):
        raise ValueError('Invalid or non-NYC route coordinates')
    return route

def query_route(snapshot,route,radius):
    merged,_=m.merge_sources(snapshot)
    bounds,*_=m.geometry(snapshot['policy'],snapshot['coverage'])
    west,south,east,north=padded_bbox(route,radius)
    matches=[]
    for item in merged:
        record=m.normalize(item,snapshot['policy'],bounds);a=record['analysis']
        if not a['eligible']:continue
        lon,lat=a['longitude'],a['latitude']
        if not (west<=lon<=east and south<=lat<=north):continue
        distance=min(point_segment_m((lon,lat),x,y) for x,y in zip(route,route[1:]))
        if distance<=radius:matches.append({'distanceToPublishedPointM':round(distance,3),'complaint':record})
    summary={'radiusM':radius,'eligibleComplaintsNearRoute':len(matches),
        'byNativeKeyCode':dict(Counter(x['complaint']['native']['ky_cd'] for x in matches)),
        'periodStart':snapshot['policy']['periodStart'],'periodEndExclusive':snapshot['policy']['periodEndExclusive'],
        'bbox':list(padded_bbox(route,radius)),'snapshotRetrievedAt':snapshot['retrievedAt'],
        'distanceMethod':'Minimum spherical point-to-great-circle-segment distance; Earth radius 6371008.8m.',
        'limitations':['Distance is to the NYPD published approximate point, not the undisclosed original incident location.',
                      'Nearby complaint counts are an audit diagnostic, not the app route exposure score.',
                      'This command does not establish route coverage. The app must use the NYC coverage guard before scoring.']}
    return summary,matches

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--snapshot',type=Path,default=ROOT/'private-data/nyc/snapshot.json.gz')
    p.add_argument('--route',type=Path,required=True)
    p.add_argument('--radius-m',type=float,default=250)
    p.add_argument('--include-records',action='store_true',help='Include native complaint fields; keep output local')
    p.add_argument('--output',type=Path)
    args=p.parse_args()
    if not math.isfinite(args.radius_m) or not(0<args.radius_m<=5000):p.error('radius-m must be 0..5000')
    route=route_coordinates(json.loads(args.route.read_text()))
    summary,matches=query_route(m.read_snapshot(args.snapshot),route,args.radius_m)
    if args.include_records:summary['matches']=matches
    text=json.dumps(summary,ensure_ascii=False,indent=2)+'\n'
    if args.output:args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(text)
    else:print(text,end='')

if __name__=='__main__':main()
