import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('query_route',Path(__file__).resolve().parents[1]/'scripts/query-nyc-route.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class RouteDistance(unittest.TestCase):
    def test_point_on_segment(self):self.assertAlmostEqual(m.point_segment_m((-73.99,40.75),(-73.99,40.74),(-73.99,40.76)),0,delta=.0001)
    def test_point_beyond_endpoint(self):self.assertAlmostEqual(m.point_segment_m((-73.97,40.75),(-74.0,40.75),(-73.98,40.75)),m.angular_distance((-73.97,40.75),(-73.98,40.75))*m.EARTH_RADIUS,places=6)
    def test_perpendicular_distance(self):self.assertAlmostEqual(m.point_segment_m((-73.99,40.751),(-74.0,40.75),(-73.98,40.75)),111.195,delta=.06)
    def test_zero_length_segment(self):self.assertAlmostEqual(m.point_segment_m((-73.99,40.751),(-73.99,40.75),(-73.99,40.75)),111.195,delta=.01)
    def test_geojson_order(self):
        with self.assertRaises(ValueError):m.route_coordinates({'type':'LineString','coordinates':[[40.7,-74],[40.8,-73.9]]})
if __name__=='__main__':unittest.main()
