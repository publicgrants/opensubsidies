# Grant.com

Grant.com is a global, interactive grant intelligence platform designed to be the category-defining discovery layer for public funding opportunities. This repository contains the UI implementation and data scaffolding for the Grant.com dashboard experience, built as a rebranded and deeply customized maps-based interface focused on grants rather than generic locations.

The product intent is clear: make Grant.com the most trusted public interface for finding, filtering, and understanding grant programs across jurisdictions, while complementing AI-native workflows such as Grant Matching and Grant Writing.

## Product Vision

Grant.com is built to function as:

- A public, map-first intelligence surface for grants worldwide
- A canonical index of open schemes across markets, funders, and sectors
- A decision-support interface for SMEs, startups, researchers, and larger organizations
- A human-facing companion to AI assistant integrations and connector-based workflows

The dashboard is meant to provide macro visibility (global patterns and opportunity distribution) and micro visibility (grant-level requirements, timelines, fit, and funding terms) in one unified experience.

## What The Dashboard Covers

The current implementation focuses on a production-grade grant discovery interface with realistic seed data and interaction patterns suitable for real-world expansion.

Core coverage includes:

- Global and multi-region grant entries with country/market context
- Funder-level metadata and scheme categorization
- Funding amounts, deadlines, and key eligibility signals
- Search, filtering, and progressive narrowing of opportunities
- Favorites and recent interactions for personal workflow continuity
- Interactive map controls for spatial and geographic exploration
- Side-panel card and detail patterns for fast comparison

## UX and Interaction Goals

The Grant.com interface is intentionally optimized for high-intent decision journeys:

1. Start broad (global map, key filters, discovery at a glance)
2. Narrow by relevance (sector, location, budget range, timelines, fit)
3. Validate quickly (structured card details and visual signals)
4. Save and compare (favorites/recents)
5. Move toward action (application planning and AI-assisted drafting flows)

Design direction emphasizes:

- Data clarity over decorative complexity
- Fast scanability for time-sensitive opportunities
- Credible institutional tone appropriate for public funding workflows
- Consistent component language across map, list, and detail surfaces
- Dark/light mode support and accessibility-aware interaction patterns

## Strategic Positioning Context

Grant.com targets an open market position: a cross-border grant intelligence layer with connector-ready architecture for AI-assisted discovery and workflow orchestration.

From a product strategy perspective, this implementation supports:

- Expansion from regional to global grant coverage
- Stronger standardization of grant metadata and comparability
- Better discovery velocity in fragmented public-funding ecosystems
- Foundation for deeper data integrations and compliance-aware workflows

## Repository Structure

This repository contains multiple template families, with Grant.com implemented in the maps template workspace.

- `templates/maps` — primary Grant.com dashboard implementation
- `templates/maps/mock-data/locations.ts` — large-scale, realistic grant seed data
- `templates/maps/store/maps-store.ts` — map/list state, filters, favorites, and recents
- `templates/maps/components/dashboard/*` — dashboard composition and interaction surfaces
- `templates/maps/app/*` — app shell, metadata, theme, and global styles

## Tech Stack

The Grant.com dashboard is built with:

- Next.js (App Router)
- React + TypeScript
- Tailwind CSS v4
- shadcn/ui component patterns
- Radix UI primitives
- Zustand for state management
- MapLibre GL for map rendering and interaction

## Getting Started

### 1) Install dependencies

```bash
cd templates/maps
pnpm install
```

### 2) Run development server

```bash
pnpm dev
```

### 3) Build for production

```bash
pnpm build
pnpm start
```

## Current Implementation Notes

- The package in `templates/maps` is configured as `grant-com`
- App metadata and theming are aligned with the Grant.com brand direction
- Seed data has been expanded to simulate global grant intelligence coverage
- UI details have been tuned for grant-specific readability and navigation

## Roadmap Direction

Near-term platform priorities include:

- Integrating live funder and scheme ingestion pipelines
- Increasing data validation and normalization depth per jurisdiction
- Expanding filter and analytics dimensions for high-signal matching
- Tightening interoperability with Grant Matching and Grant Writing connectors
- Advancing trust, governance, and compliance posture for enterprise/public-sector use

## Who This Is For

Grant.com is designed for:

- Founders and SMB operators seeking non-dilutive funding
- Innovation teams mapping funding options across markets
- Grant consultants and advisors needing faster research workflows
- Public-sector and ecosystem stakeholders monitoring grant availability

## License

This repository currently includes a top-level `LICENSE.md`. Use and distribution should follow the terms defined there unless superseded by future Grant.com-specific licensing updates.
