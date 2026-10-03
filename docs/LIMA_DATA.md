# Lima source audit

Status: **routing only; no validated exposure grid**. Research date: 2026-10-03.

No `public/data/lima.json` is supplied. Missing evidence must not become a zero-risk grid or a synthetic demo. Lima routes can be calculated, but incident exposure and safety comparisons must remain unavailable.

## Promising official source: San Juan de Miraflores CCO

The [municipal dataset catalog](https://www.datosabiertos.gob.pe/dataset/relaci%C3%B3n-de-incidencias-atendidas-por-el-centro-de-control-de-operaciones-cco-municipalidad) describes incident-level records from the municipal operations center, covering **San Juan de Miraflores only**, UBIGEO 150141. This is not Miraflores district and not metropolitan Lima coverage.

The [CSV resource description](https://www.datosabiertos.gob.pe/dataset/relaci%C3%B3n-de-incidencias-atendidas-por-el-centro-de-control-de-operaciones-cco-0) identifies `incidencias_seguridad_sjm_20260610.csv`, 1.04 MB, 22 fields, UTF-8 BOM, comma delimited, with WGS84 coordinates and registration/closure timestamps. Catalog coverage is January 1–June 10, 2026. The catalog lists ODC-By attribution licensing. These are publisher metadata claims; individual CSV records have not been inspected.

The catalog describes closed incidents, including attended, justified, and unattended records, and includes municipal emergencies and public-order matters. Consequently, neither all records nor the source severity field can automatically be interpreted as crime or pedestrian exposure.

Live retrieval of the resource page and the conventional Drupal file URL returned a CloudWAF block page during this audit. Browser-search indexing exposed metadata but not the source records. The actual download URL, CSV schema, coordinates, categories, duplicate IDs, and temporal completeness remain unverified. No importer was written against guessed column names.

## Other official sources reviewed

[MININTER territorial security indicators](https://www.datosabiertos.gob.pe/dataset/indicadores-de-seguridad-ciudadana-y-tendencias-territoriales-mininter) describe annual indicator values by geographic scope and UBIGEO. These do not establish street-level locations or time-of-day exposure.

[MPFN reported offences 2025](https://www.datosabiertos.gob.pe/dataset/mpfn-delitos-denunciados/resource/b0099abc-48d1-41b0-bae1-dadc95493afd) exposes counts by fiscal district and offence, with PJFS administrative-location fields. These are not incident coordinates. Assigning them to district centroids would falsely create local hotspots.

## Requirements before activation

1. Retrieve and inspect the official CSV and dictionary; record the exact resource URL and SHA-256 checksum.
2. Identify actual incident IDs, remove duplicates, validate coordinates and dates, audit missingness and suspicious repeated coordinates, and inspect offence categories. Do not publish raw addresses or incident points.
3. Use a documented, defensible subset of relevant reported incidents; retain counts of accepted and excluded records and why they were excluded.
4. Establish coverage using an authoritative district boundary. The bounding box of incident observations alone is not proof of reporting coverage. Exclude routes outside validated coverage from exposure comparisons.
5. Aggregate into grid cells with a latitude-appropriate projection. Use time buckets only if the dictionary establishes what the timestamp means and records support that resolution; registration time is not automatically event time.
6. Label the source and limited period prominently. Historical municipal reports are not a prediction or a guarantee of personal safety. No population/exposure denominator is currently established.
7. Add a reproducible importer and aggregate asset only after these validations pass. Keep unsupported transport modes disabled.

## Additional municipal and geospatial follow-up

The [Miraflores municipal open-data portal](https://www.miraflores.gob.pe/datos-abiertos/) links its security category to [Relación de intervenciones](https://www.datosabiertos.gob.pe/dataset/relaci%C3%B3n-de-intervenciones-%C2%A0municipalidad-de-miraflores), catalog identifier `27c2b2dd-b9c3-4878-9bbb-f07c7742544f`, modified October 17, 2024. The inspected catalog entry exposed no downloadable resource or coordinate schema. No records were imported.

The [official government description of MININTER's crime map](https://www.gob.pe/33281-observatorio-nacional-de-seguridad-ciudadana-mapa-del-delito-georreferenciado) and [MININTER geoportal](https://geoportal.mininter.gob.pe/) lead to this [public ArcGIS application](https://geomininter.mininter.gob.pe/portal/apps/webappviewer/index.html?id=4b3387e1beaf4f919925dcc013bb4cd7). Its public application configuration and linked webmap `eec464e0dc1e40c0811114c251390863` were successfully downloaded and inspected. Both advertise the layer `UBICACION HECHO DELICTIVO` at:

```
https://seguridadciudadana.mininter.gob.pe/arcgis/rest/services/servicios_ogc/denuncias/MapServer/0
```

That layer's public metadata request timed out after 30 seconds; the research browser could not access it either. Thus the schema, dates, completeness, licensing and exportability of the incident records remain unverified. A functioning visualization or advertised endpoint alone is insufficient evidence for a reproducible local dataset. This official service is a useful future lead alongside the SJM CSV; no authentication barriers or WAF protections were bypassed.
