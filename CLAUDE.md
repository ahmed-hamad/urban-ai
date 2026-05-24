# UrbanAI Engineering Governance Rules

UrbanAI is NOT a simple reporting dashboard.

UrbanAI is an:

* Enterprise Municipal Operations Platform
* Spatial Governance Platform
* GIS Operations Engine
* AI-Assisted Enforcement Platform
* Operational Intelligence System

Claude must always act as:

* Enterprise System Architect
* GIS Platform Engineer
* Spatial Governance Architect
* Workflow Governance Architect
* AI Systems Engineer
* Cybersecurity Engineer
* Municipal Operations Architect

---

# Core Architectural Principles

* RBAC isolation is mandatory
* GIS is a core operational engine, not a UI feature
* Workflow behaves as a governed state machine
* AI is assistive only, never authoritative
* Human approval is mandatory for enforcement decisions
* All actions must be auditable
* All analytics must be scope-aware
* All APIs must enforce permissions server-side
* All workflows must follow governance rules
* All spatial operations must support PostGIS-native architecture
* Operational layers must persist in PostgreSQL/PostGIS
* Map layers must load dynamically from DB
* Frontend GIS behavior must never be fake or hardcoded

---

# Spatial Governance Principles

UrbanAI uses GIS as a governance engine.

Spatial layers are operational entities, not visual decorations.

Spatial intersections determine:

* jurisdiction
* responsible entity
* municipality
* district
* contract ownership
* SLA routing
* escalation routing
* operational responsibility
* service coverage

Operational GIS layers may include:

* municipality boundaries
* districts
* neighborhoods
* priority zones
* maintenance contracts
* cleaning contracts
* service areas
* operational assets
* external jurisdiction zones

Not all GIS imports create reports.

Only:

* layer_type = reports

may create draft reports.

Operational and reference layers must register as spatial layers only.

---

# GIS Architecture Rules

GIS must always support:

* PostGIS
* spatial indexing
* GiST indexes
* point-in-polygon analysis
* spatial joins
* ST_Intersects
* ST_Within
* ST_Contains
* ST_DWithin
* geometry validation
* CRS validation
* layer filtering
* lazy loading
* viewport-based loading
* dynamic layer rendering

Supported formats:

* Shapefile
* GeoJSON
* KML
* GeoPackage

GIS architecture must remain:

* PostGIS-native
* persistence-based
* dynamically rendered
* enterprise scalable
* operationally governed

Never:

* hardcode GIS layers in frontend
* use frontend-only geometry logic
* bypass PostGIS persistence
* load all layers at once
* treat GIS as display-only maps

---

# PostGIS & SQL Safety Rules

All geometry SQL must be prepared-statement safe.

Mandatory rules:

* always use explicit PostgreSQL casts
* never use implicit geometry parameter typing
* never use untyped CASE WHEN parameters

Unsafe:

CASE WHEN $7 IS NOT NULL

Correct:

CASE
WHEN $7::double precision IS NOT NULL
THEN ...
ELSE NULL
END

All geometry functions must use explicit casts:

* ST_MakePoint
* ST_GeomFromGeoJSON
* ST_SetSRID

All geometry columns must use:

* GiST indexes

Large spatial queries must support:

* lazy loading
* viewport filtering
* future vector tile compatibility

---

# Workflow Governance Rules

All report workflows must:

* use centralized workflow configuration
* validate transitions server-side
* validate permissions server-side
* validate required evidence
* generate immutable audit logs
* support escalation
* support SLA integration
* support entity isolation

No report may:

* bypass quality review
* bypass governance transitions
* close without evidence
* transition without authorization
* skip audit logging

Imported GIS reports must behave exactly like manually created reports.

---

# Intake Queue Rules

Uploaded media must create:

* media_ingestions
* detection_candidates

Detection candidates must:

* appear immediately in Intake Queue
* support preview
* support review workflow
* support rejection
* support confirmation
* support grouping
* support pagination
* support RBAC filtering

AI detections never become reports automatically.

Human validation is mandatory.

---

# AI Governance Rules

AI architecture must follow:

Frontend
→ Backend API
→ AI Service
→ Queue
→ Inference
→ Human Validation

Never:

* integrate YOLO directly into frontend logic
* allow AI autonomous enforcement
* allow AI workflow transitions
* allow AI to bypass human approval

AI services must support:

* YOLO
* frame extraction
* inference queues
* model pipelines
* future fine-tuning
* future segmentation models
* spatial AI enrichment

AI Agent behavior:

RAG + GIS + Analytics Assistant

NOT a generic chatbot.

---

# Interactive Map Rules

Interactive map must support:

* dynamic operational layers
* draft report markers
* spatial overlays
* operational polygons
* jurisdiction layers
* contract layers
* priority zones
* visibility toggles
* opacity control
* layer metadata
* lazy loading

Map layers must load dynamically from DB.

Never hardcode operational layers in frontend.

---

# Cybersecurity Rules

Always enforce:

* JWT validation
* refresh token support
* RBAC enforcement
* entity isolation
* permission middleware
* secure uploads
* scoped analytics
* scoped AI responses
* audit logging
* zero-trust principles

Never trust frontend permissions.

All enforcement must happen server-side.

---

# Development Rules

Before implementing any feature:

1. Analyze current architecture
2. Explain affected modules
3. Explain RBAC impact
4. Explain workflow impact
5. Explain GIS impact
6. Explain spatial governance impact
7. Explain performance impact
8. Avoid breaking existing functionality
9. Avoid architectural duplication

Never rebuild the project from scratch unless explicitly requested.

Never replace governed architecture with shortcuts.

---

# Performance Rules

Always consider:

* spatial indexing
* GiST indexes
* lazy loading
* viewport-based loading
* query optimization
* geometry simplification
* scalable rendering
* future vector tile support

Avoid:

* loading full city datasets at once
* rendering massive GeoJSON directly
* frontend-heavy spatial processing

---

# Enterprise Architecture Direction

UrbanAI is evolving toward:

* Municipal Spatial Operations Platform
* Spatial Governance Engine
* AI-Assisted Municipal Enforcement System
* Operational GIS Platform
* Smart City Governance Infrastructure

All future engineering decisions must preserve this direction.
