import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('nyc_converter',ROOT/'scripts/build-nyc-data.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
POLICY=json.loads((ROOT/'config/nyc-policy.json').read_text())
BOUNDS=[-74.3,40.45,-73.65,40.95]

def row(**updates):
    value={'cmplnt_num':'0000123','cmplnt_fr_dt':'2025-07-01T00:00:00.000','cmplnt_fr_tm':'13:05:00',
      'cmplnt_to_dt':'(null)','cmplnt_to_tm':'(null)','rpt_dt':'2025-07-02T00:00:00.000',
      'ky_cd':'105','ofns_desc':'ROBBERY','pd_cd':'397','pd_desc':'ROBBERY,OPEN AREA UNCLASSIFIED',
      'law_cat_cd':'FELONY','crm_atpt_cptd_cd':'ATTEMPTED','boro_nm':'QUEENS','addr_pct_cd':'105',
      'prem_typ_desc':'STREET','loc_of_occur_desc':'FRONT OF','latitude':'40.72','longitude':'-73.8'}
    value.update(updates);return value

def normalize(r):return m.normalize({'datasetId':'qgea-i56i','raw':r},POLICY,BOUNDS)

class NativeTranslation(unittest.TestCase):
    def test_preserves_source_without_fabricated_ssp_fields(self):
        original=row();r=normalize(original)
        self.assertTrue(r['analysis']['eligible']);self.assertEqual(r['native']['cmplnt_num'],'0000123')
        for k,v in original.items():self.assertEqual(r['native'][k],v)
        self.assertEqual(r['native']['crm_atpt_cptd_cd'],'ATTEMPTED')
        self.assertNotIn('severity',r['analysis']);self.assertEqual(r['analysis']['localSixHourBucket'],2)
    def test_grand_larceny_is_not_all_theft_from_person(self):
        rejected=normalize(row(ky_cd='109',ofns_desc='GRAND LARCENY',pd_cd='438',pd_desc='LARCENY,GRAND FROM BUILDING'))
        self.assertFalse(rejected['analysis']['eligible']);self.assertIsNone(rejected['analysis']['group'])
        kept=normalize(row(ky_cd='109',ofns_desc='GRAND LARCENY',pd_cd='419',pd_desc='LARCENY,GRAND FROM PERSON,UNCLASSIFIED'))
        self.assertTrue(kept['analysis']['eligible']);self.assertEqual(kept['native']['ofns_desc'],'GRAND LARCENY')
    def test_rape_and_homicide_not_forced_into_sp_weights(self):
        for ky,label in [('104','RAPE'),('101','MURDER & NON-NEGL. MANSLAUGHTER')]:
            r=normalize(row(ky_cd=ky,ofns_desc=label));self.assertFalse(r['analysis']['eligible'])
            self.assertEqual(r['native']['ofns_desc'],label)
    def test_does_not_infer_attempted_homicide_from_assault(self):
        r=normalize(row(ky_cd='106',ofns_desc='FELONY ASSAULT'))
        self.assertEqual(r['analysis']['group'],'felony_assault')
    def test_missing_and_nan_coordinates_are_not_zero(self):
        for lat in [None,'NaN','Infinity','0']:
            r=normalize(row(latitude=lat));self.assertFalse(r['analysis']['eligible'])
    def test_temporal_unknown_and_intervals(self):
        for data,reason in [({'cmplnt_fr_tm':'(null)'},'missing_or_invalid_start'),
          ({'cmplnt_to_dt':'2025-07-01T00:00:00.000','cmplnt_to_tm':'19:00:00'},'interval_crosses_date_or_bucket'),
          ({'cmplnt_to_dt':'2025-07-01T00:00:00.000'},'incomplete_or_invalid_interval'),
          ({'cmplnt_to_dt':'2025-07-01T00:00:00.000','cmplnt_to_tm':'12:00:00'},'reversed_interval')]:
            bucket,problem=m.time_bucket(row(**data));self.assertIsNone(bucket);self.assertEqual(problem,reason)
        self.assertEqual(m.time_bucket(row(cmplnt_to_dt='2025-07-01T00:00:00.000',cmplnt_to_tm='15:00:00')),(2,None))
    def test_no_local_to_utc_shift(self):
        r=normalize(row(cmplnt_fr_tm='23:50:00'));self.assertEqual(r['analysis']['localSixHourBucket'],3)
        self.assertEqual(r['analysis']['occurrenceStartDate'],'2025-07-01')
    def test_end_exclusive_and_outdoor_selection(self):
        self.assertFalse(normalize(row(cmplnt_fr_dt='2026-01-01T00:00:00.000'))['analysis']['eligible'])
        self.assertFalse(normalize(row(prem_typ_desc='RESIDENCE - APT. HOUSE'))['analysis']['eligible'])
    def test_taxonomy_changes_fail_closed(self):
        self.assertIn('missing_or_changed_offense_label',normalize(row(ofns_desc='NEW LABEL'))['analysis']['exclusions'])
    def test_current_correction_supersedes_historic_even_if_now_excluded(self):
        def source(id,r):return {'datasetId':id,'rows':[r],'expectedRows':1,'recordsSha256':m.sha(m.compact([r]))}
        snapshot={'sources':[source('qgea-i56i',row()),source('5uac-w243',row(ky_cd='341',ofns_desc='PETIT LARCENY'))]}
        merged,removed=m.merge_sources(snapshot)
        self.assertEqual(removed,1);self.assertEqual(len(merged),1)
        self.assertEqual(merged[0]['datasetId'],'5uac-w243');self.assertFalse(normalize(merged[0]['raw'])['analysis']['eligible'])
    def test_snapshot_hash_detects_modified_records(self):
        data={'datasetId':'qgea-i56i','rows':[row()],'expectedRows':1,'recordsSha256':'bad'}
        with self.assertRaises(ValueError):m.merge_sources({'sources':[data]})

if __name__=='__main__':unittest.main()
