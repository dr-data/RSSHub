# RSSHub Workflow Improvements and User-Friendly Source Management

## Overview

This document outlines improvements to the RSSHub development workflow and proposes a new method to make adding and modifying RSS sources more user-friendly for end-users.

## Workflow Improvements for Developers

### 1. Unified Scaffolding Tool

**Current State:** Developers manually create folders and files for new routes.
**Improvement:** Implement a CLI tool (e.g., `npm run create-route <namespace> <route-name>`) that:

- Creates the directory structure.
- Generates `namespace.ts` and the route file with boilerplate code.
- Adds necessary imports to `registry.ts` (if not dynamic).
- Creates a corresponding test file.

### 2. Enhanced Testing Infrastructure

**Current State:** Testing relies on `vitest` and often requires mocking external requests.
**Improvement:**

- Provide a standard mocking utility for `ofetch` and `got` in tests to easily simulate HTML responses.
- Add "Snapshot Testing" for route outputs to ensure consistent RSS structures.

### 3. Documentation Integration

**Current State:** Documentation is in a separate repository or requires manual updates.
**Improvement:** Use JSDoc or special comments in route files to auto-generate documentation for `docs.rsshub.app`, ensuring code and docs stay in sync.

## User-Friendly Source Management (Universal Route)

To empower end-users (who may not be developers) to create their own feeds, we are introducing a **Universal Route** and a **Webapp Builder**.

### 1. Universal Route (`/universal/feed`)

A generic route that accepts parameters to scrape _any_ website.

- **Parameters:**
    - `url`: The target URL to scrape.
    - `item`: CSS selector for the list of items (e.g., `.post`).
    - `title`: CSS selector for the item title (relative to `item`).
    - `desc`: CSS selector for the item description.
    - `link`: CSS selector for the item link.
    - `date`: CSS selector for the publication date.

### 2. Feed Builder Webapp (`/webapp`)

A simple graphical interface hosted on RSSHub.

- Users input the target URL.
- Users specify CSS selectors (with visual help instructions).
- The Webapp generates the final RSSHub URL (e.g., `https://rsshub.app/universal/feed?url=...`).
- **Benefit:** Users can "create" feeds without writing code or waiting for a developer to implement a specific route.
