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

# AI Agent behavior:

RAG + GIS + Analytics + Operational Intelligence Assistant

The AI assistant must understand:

* GIS layers
* report workflows
* operational KPIs
* VPI analytics
* forecast analytics
* coverage analytics
* executive dashboards
* municipality performance
* priority zone performance
* spatial intersections

AI responses must always respect RBAC.

The AI assistant must use:

* governed analytics tables
* governed GIS services
* governed KPI engines

Never generate unsupported KPI values.

Never hallucinate analytics.

Never bypass scope restrictions.
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
8. Explain Mobile Readiness impact
9. Explain AI impact
10. Avoid breaking existing functionality
11. Avoid architectural duplication

Before implementing any **major** feature, provide a full 8-point impact analysis:

* Architecture Impact
* API Impact
* RBAC Impact
* Workflow Impact
* GIS Impact
* Mobile Readiness Impact
* AI Impact
* Security Impact

Verify that future mobile applications can consume the functionality without backend redesign.

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


---

# VPI Analytics Governance

VPI is an official KPI engine.

Official VPI may only be calculated from:

* Official Monthly Observation Datasets
* Official Monthly Coverage Datasets

Official KPI calculations must support:

* Amanah VPI
* Municipality VPI
* Priority Zone VPI
* Element VPI

All KPI calculations must be snapshot-based.

Monthly snapshots are immutable.

Never overwrite historical KPI periods.

Support:

* target management
* historical comparisons
* trend analysis
* contribution analysis
* executive reporting

Coverage calculations must use:

Covered Area (km²)

The field:
المساحة (كم2)

is the official covered area measurement.

VPI and Coverage targets must be configurable.

Never hardcode KPI targets.

---

# Forecast Governance Rules

Forecast analytics are operational estimates.

Forecast values are NOT official KPI values.

Forecast calculations must remain isolated from:

* official VPI datasets
* official KPI tables
* official reports

Forecast engines may use:

* daily observations
* coverage progress
* historical trends
* estimation rules

Forecast outputs must be labeled:

* Estimated
* Forecast
* Predicted

Never present forecast values as official KPI values.

Official KPI values always take precedence.

---

# Operational Intelligence Rules

Operational Intelligence is a governed analytics domain.

Operational Intelligence must support:

* visit analytics
* closure analytics
* in-progress analytics
* stalled reports
* repeated observations
* operational KPIs
* executive insights

Operational Intelligence datasets must remain separate from:

* official reports
* workflow records
* KPI snapshots

Support:

* municipality analysis
* priority zone analysis
* element analysis
* lifecycle analysis
* operational performance metrics

---

# Mobile Readiness Rules

UrbanAI is a Platform, not a Web Application.

The React frontend is only one client.

Future clients may include:

* Android App
* iPhone App
* Tablet App
* Rugged Field Devices
* External APIs
* Government Integrations

All new functionality must be exposed through governed APIs.

Business logic must never be implemented inside frontend applications.

Frontend applications (Web and Mobile) must consume the same APIs.

The system architecture must remain:

Client
→ API Layer
→ Application Services
→ Domain Services
→ Database

to allow future React Native mobile applications without backend redesign.

All GIS, Workflow, Analytics and AI functionality must be mobile-ready through APIs.

Before implementing any new feature, verify:

Can this functionality be consumed by Web, Mobile, GIS, and AI Copilot through APIs?

If not — refactor first.

---

# Mobile Readiness — Required API Domain Coverage

Every capability must be exposed through a governed API.

This includes:

* Authentication (JWT + Refresh Tokens, platform-wide, never web-only)
* Users, Roles, Permissions
* Reports, Draft Reports, Imported Reports
* GIS Layers, Intersections, Municipal Boundaries, Priority Zones, Contracts
* Workflow Actions (Create / Assign / Start Visit / Finish Visit / Submit Evidence / Request Review / Close)
* Attachments, Media Uploads
* Analytics, VPI, Forecasting, Operational Intelligence
* Notifications (backend-originated, never frontend logic)
* AI Copilot

No capability may exist only inside React components.

---

# Media Governance

Media services must support future field operations.

Supported media types:

* Images
* Videos
* Geotagged Media
* Evidence Attachments
* AI Processing Inputs

Store separately from files:

* Media Metadata
* GPS Metadata
* Capture Metadata

All uploads must be API-based.

Never tie media logic to frontend components.

---

# Notification Architecture

Notifications are a backend domain.

Future notification types:

* Push Notifications
* Workflow Notifications
* Assignment Notifications
* SLA Notifications
* AI Alerts
* GIS Alerts

Notifications must originate from backend events only.

Never from frontend logic.

Design notification domain to support future push delivery without backend redesign.

---

# Offline Readiness (Architecture Only)

Do NOT implement offline mode in the current phase.

However — design all entities and APIs to support future synchronization.

Prepare architecture for:

* Local Storage
* Synchronization
* Conflict Resolution
* Retry Queues

No implementation required now.

Architecture readiness only.

---

# Field Operations Future Vision

The future mobile application will be a Field Operations Client — not a second copy of the UrbanAI web platform.

Primary field responsibilities:

* Receive Assignments
* Navigate to Reports
* Capture Images
* Capture Videos
* Record Visits
* Upload Evidence
* Update Status
* Close Reports
* Receive Notifications

Advanced analytics and management capabilities remain in the Web Platform.

Device support must include:

* Android
* iPhone
* Tablets
* Rugged Devices

Do not introduce platform-specific assumptions in backend services.

---

# Current Phase Restrictions — DO NOT BUILD

During the Platform Stabilization Phase, do NOT build:

* React Native App
* Mobile Screens
* Offline Synchronization
* Push Notification Infrastructure

Current phase objective: architecture readiness only.

---

# Platform Success Criteria

When UrbanAI reaches platform stability:

A React Native mobile application must be buildable using existing APIs with minimal backend modifications.

No major redesign should be required for:

* Database
* GIS Services
* Workflow Services
* Analytics Services
* AI Services
---

# Multi-Client Architecture Rules

UrbanAI is a platform serving multiple clients.

Clients may include:

* Web Platform
* Future Mobile Applications
* AI Copilot
* GIS Services
* External Government Integrations
* Future Public APIs

The React frontend is only one client.

Business entities belong to the platform, not to individual clients.

Domain models must remain shared across:

* Web
* Mobile
* AI
* GIS

Avoid creating client-specific business entities.

Platform architecture must always remain:

Client
→ API
→ Services
→ Database

Never implement business logic exclusively for a single client.

---

# API Governance Rules

All public APIs must support versioning.

Examples:

* /api/v1/reports
* /api/v1/gis
* /api/v1/analytics
* /api/v1/assistant

API changes must remain backward compatible whenever possible.

Mobile clients must not break due to frontend-driven API changes.

Business logic must be exposed through governed APIs.

No functionality may exist only inside frontend components.

---

# AI Vision Architecture Rules

Computer Vision services must remain isolated from UrbanAI core services.

Architecture:

Web / Mobile
→ Backend APIs
→ AI Vision Service
→ Inference Pipeline

The AI Vision Service may include:

* YOLO
* Object Detection
* Segmentation Models
* Future Fine-Tuned Models

Never embed Computer Vision models inside:

* React Frontend
* Mobile Applications
* Core Workflow Services

AI Vision outputs are suggestions only.

Human validation remains mandatory.

AI detections must never create official reports automatically.

---

All future engineering decisions must preserve this direction.
