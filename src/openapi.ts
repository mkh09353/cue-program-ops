/**
 * OpenAPI 3.1 description of the Ruckus HTTP API, embedded as a plain string.
 *
 * Why a TypeScript module rather than reading docs/openapi.yaml at runtime:
 * Cloudflare Workers have no filesystem, so fs is unavailable in production; a
 * Vite raw import would not survive tsc or the Wrangler bundle; and a bundler
 * loader rule would need wrangler configuration. A plain exported string works
 * identically under Node tests, tsc, Vite and Wrangler with no build step.
 *
 * docs/openapi.yaml is the human readable copy and MUST stay byte identical to
 * this string - test/openapi.test.ts fails if the two drift apart.
 *
 * app.ts serves this string at GET /api/openapi.yaml using OPENAPI_PATH and
 * OPENAPI_CONTENT_TYPE below, so the document describes its own endpoint.
 */
export const OPENAPI_YAML = `openapi: 3.1.0
info:
  title: Ruckus Conference Program Operations API
  version: 1.0.0
  summary: Conference program operations - CFP, review, speakers, schedule, comms, CRM and public program feeds.
  description: >-
    HTTP API for Ruckus, an open-source conference program-operations tool. Paths are
    generated from the live Hono route registrations in src/app.ts and the src route
    modules, so path and method coverage is exact. Request and response bodies are
    intentionally loose object schemas with descriptions: handlers accept and return
    JSON envelopes shaped as a data property, and the demo does not enforce strict
    field level typing. Identity is demo persona simulation, not authentication.
  license:
    name: MIT
servers:
  - url: https://ruckus.to
    description: Live demo deployment
  - url: http://localhost:8787
    description: Local development API
tags:
  - name: meta
    description: "Health and demo data."
  - name: events
    description: "Event registry, bootstrap, settings, resources and embed configurations."
  - name: cfp-public
    description: "Public call-for-proposals schema, program projections and access token resolution."
  - name: submissions
    description: "CFP forms and proposal lifecycle, including public submit and edit."
  - name: reviews
    description: "Review rounds, assignments, reviewer queue, scoring and results."
  - name: speakers
    description: "Speaker roster, onboarding tasks, deliverables and content files."
  - name: schedule-agenda
    description: "Canonical schedule placement, conflicts, rooms, tracks and AI agenda proposals."
  - name: comms
    description: "Templated communications, reminders, decision notifications and calendar invitations."
  - name: crm
    description: "Organization level speaker CRM: contacts, pipeline, segments and imports."
  - name: public-widgets
    description: "Embeddable public program widgets and machine readable feeds."
  - name: sync
    description: "One way Accelevents synchronization runs and history."
security: []
paths:
  "/api/calendar/{filename}":
    parameters:
      - name: filename
        in: path
        required: true
        schema:
          type: string
        description: "filename path parameter."
    get:
      tags: [comms]
      operationId: get_api_calendar_filename
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            text/calendar:
              schema:
                type: string
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/communications/{id}/calendar.ics":
    parameters:
      - name: id
        in: path
        required: true
        schema:
          type: string
        description: "id path parameter."
    get:
      tags: [comms]
      operationId: get_api_communications_id_calendar_ics
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            text/calendar:
              schema:
                type: string
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/content/files/{fileId}/comments":
    parameters:
      - name: fileId
        in: path
        required: true
        schema:
          type: string
        description: "fileId path parameter."
    post:
      tags: [speakers]
      operationId: post_api_content_files_fileId_comments
      summary: "Registered in contentRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/content/files/{fileId}/versions/{versionId}":
    parameters:
      - name: fileId
        in: path
        required: true
        schema:
          type: string
        description: "fileId path parameter."
      - name: versionId
        in: path
        required: true
        schema:
          type: string
        description: "versionId path parameter."
    get:
      tags: [speakers]
      operationId: get_api_content_files_fileId_versions_versionId
      summary: "Registered in contentRoutes.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  /api/crm/campaigns:
    get:
      tags: [crm]
      operationId: get_api_crm_campaigns
      summary: "Registered in crmRoutes.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  /api/crm/communicate:
    post:
      tags: [crm]
      operationId: post_api_crm_communicate
      summary: "Registered in crmRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  /api/crm/contacts:
    get:
      tags: [crm]
      operationId: get_api_crm_contacts
      summary: "Registered in crmRoutes.ts. See docs/API.md for role and behaviour notes."
      parameters:
        - name: company
          in: query
          required: false
          schema:
            type: string
          description: "company filter parameter."
        - name: q
          in: query
          required: false
          schema:
            type: string
          description: "q filter parameter."
        - name: stage
          in: query
          required: false
          schema:
            type: string
          description: "stage filter parameter."
        - name: tag
          in: query
          required: false
          schema:
            type: string
          description: "tag filter parameter."
        - name: tags
          in: query
          required: false
          schema:
            type: string
          description: "tags filter parameter."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
    post:
      tags: [crm]
      operationId: post_api_crm_contacts
      summary: "Registered in crmRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  /api/crm/contacts/merge:
    post:
      tags: [crm]
      operationId: post_api_crm_contacts_merge
      summary: "Registered in crmRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/crm/contacts/{id}":
    parameters:
      - name: id
        in: path
        required: true
        schema:
          type: string
        description: "id path parameter."
    get:
      tags: [crm]
      operationId: get_api_crm_contacts_id
      summary: "Registered in crmRoutes.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
    patch:
      tags: [crm]
      operationId: patch_api_crm_contacts_id
      summary: "Registered in crmRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
    delete:
      tags: [crm]
      operationId: delete_api_crm_contacts_id
      summary: "Registered in crmRoutes.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/crm/contacts/{id}/add-to-event":
    parameters:
      - name: id
        in: path
        required: true
        schema:
          type: string
        description: "id path parameter."
    post:
      tags: [crm]
      operationId: post_api_crm_contacts_id_add_to_event
      summary: "Registered in crmRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/crm/contacts/{id}/notes":
    parameters:
      - name: id
        in: path
        required: true
        schema:
          type: string
        description: "id path parameter."
    post:
      tags: [crm]
      operationId: post_api_crm_contacts_id_notes
      summary: "Registered in crmRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/crm/contacts/{id}/stage":
    parameters:
      - name: id
        in: path
        required: true
        schema:
          type: string
        description: "id path parameter."
    post:
      tags: [crm]
      operationId: post_api_crm_contacts_id_stage
      summary: "Registered in crmRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  /api/crm/dashboard:
    get:
      tags: [crm]
      operationId: get_api_crm_dashboard
      summary: "Registered in crmRoutes.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  /api/crm/field-definitions:
    get:
      tags: [crm]
      operationId: get_api_crm_field_definitions
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
    post:
      tags: [crm]
      operationId: post_api_crm_field_definitions
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/crm/field-definitions/{key}":
    parameters:
      - name: key
        in: path
        required: true
        schema:
          type: string
        description: "key path parameter."
    delete:
      tags: [crm]
      operationId: delete_api_crm_field_definitions_key
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  /api/crm/import:
    post:
      tags: [crm]
      operationId: post_api_crm_import
      summary: "Registered in crmRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  /api/crm/import/validate:
    post:
      tags: [crm]
      operationId: post_api_crm_import_validate
      summary: "Registered in crmRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  /api/crm/pipeline:
    get:
      tags: [crm]
      operationId: get_api_crm_pipeline
      summary: "Registered in crmRoutes.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  /api/crm/segments:
    get:
      tags: [crm]
      operationId: get_api_crm_segments
      summary: "Registered in crmRoutes.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
    post:
      tags: [crm]
      operationId: post_api_crm_segments
      summary: "Registered in crmRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/crm/segments/{id}":
    parameters:
      - name: id
        in: path
        required: true
        schema:
          type: string
        description: "id path parameter."
    delete:
      tags: [crm]
      operationId: delete_api_crm_segments_id
      summary: "Registered in crmRoutes.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  /api/crm/stages:
    get:
      tags: [crm]
      operationId: get_api_crm_stages
      summary: "Registered in crmRoutes.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  /api/crm/sync-event-speakers:
    post:
      tags: [crm]
      operationId: post_api_crm_sync_event_speakers
      summary: "Registered in crmRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  /api/events:
    get:
      tags: [events]
      operationId: get_api_events
      summary: "List every event in the registry, seeded events first."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
    post:
      tags: [events]
      operationId: post_api_events
      summary: "Create an event with its own lifecycle store and canonical schedule. A taken slug is auto-uniquified rather than rejected."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/agenda/proposals":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [schedule-agenda]
      operationId: get_api_events_eventId_agenda_proposals
      summary: "Registered in agendaRoutes.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/agenda/proposals/generate":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    post:
      tags: [schedule-agenda]
      operationId: post_api_events_eventId_agenda_proposals_generate
      summary: "Registered in agendaRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/agenda/proposals/{id}/placements/{placementId}/{decision}":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
      - name: id
        in: path
        required: true
        schema:
          type: string
        description: "id path parameter."
      - name: placementId
        in: path
        required: true
        schema:
          type: string
        description: "placementId path parameter."
      - name: decision
        in: path
        required: true
        schema:
          type: string
        description: "decision path parameter."
    post:
      tags: [schedule-agenda]
      operationId: post_api_events_eventId_agenda_proposals_id_placements_placementId_decision
      summary: "Registered in agendaRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/agenda/proposals/{id}/{decision}":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
      - name: id
        in: path
        required: true
        schema:
          type: string
        description: "id path parameter."
      - name: decision
        in: path
        required: true
        schema:
          type: string
        description: "decision path parameter."
    post:
      tags: [schedule-agenda]
      operationId: post_api_events_eventId_agenda_proposals_id_decision
      summary: "Registered in agendaRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/agenda/publish":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    post:
      tags: [schedule-agenda]
      operationId: post_api_events_eventId_agenda_publish
      summary: "Registered in agendaRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/agenda/rooms":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    post:
      tags: [schedule-agenda]
      operationId: post_api_events_eventId_agenda_rooms
      summary: "Registered in agendaRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/agenda/rooms/{roomId}":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
      - name: roomId
        in: path
        required: true
        schema:
          type: string
        description: "roomId path parameter."
    patch:
      tags: [schedule-agenda]
      operationId: patch_api_events_eventId_agenda_rooms_roomId
      summary: "Registered in agendaRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/agenda/tracks":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    post:
      tags: [schedule-agenda]
      operationId: post_api_events_eventId_agenda_tracks
      summary: "Registered in agendaRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/agenda/tracks/{trackId}":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
      - name: trackId
        in: path
        required: true
        schema:
          type: string
        description: "trackId path parameter."
    patch:
      tags: [schedule-agenda]
      operationId: patch_api_events_eventId_agenda_tracks_trackId
      summary: "Registered in agendaRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/automation":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [comms]
      operationId: get_api_events_eventId_automation
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/bootstrap":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [events]
      operationId: get_api_events_eventId_bootstrap
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/command":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [events]
      operationId: get_api_events_eventId_command
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/comms/decisions/preview":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    post:
      tags: [reviews]
      operationId: post_api_events_eventId_comms_decisions_preview
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/comms/decisions/send":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    post:
      tags: [comms]
      operationId: post_api_events_eventId_comms_decisions_send
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/comms/log":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [comms]
      operationId: get_api_events_eventId_comms_log
      summary: "Registered in speakerRoutes.ts. See docs/API.md for role and behaviour notes."
      description: >-
        This path and method is registered in more than one module. Sub applications are
        mounted before the inline handlers, so the module named in the summary answers.
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/comms/preview":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    post:
      tags: [reviews]
      operationId: post_api_events_eventId_comms_preview
      summary: "Registered in speakerRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/comms/reminders/plan":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    post:
      tags: [comms]
      operationId: post_api_events_eventId_comms_reminders_plan
      summary: "Registered in speakerRoutes.ts. See docs/API.md for role and behaviour notes."
      description: >-
        This path and method is registered in more than one module. Sub applications are
        mounted before the inline handlers, so the module named in the summary answers.
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/comms/reminders/run":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    post:
      tags: [comms]
      operationId: post_api_events_eventId_comms_reminders_run
      summary: "Registered in speakerRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/comms/send":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    post:
      tags: [comms]
      operationId: post_api_events_eventId_comms_send
      summary: "Registered in speakerRoutes.ts. See docs/API.md for role and behaviour notes."
      description: >-
        This path and method is registered in more than one module. Sub applications are
        mounted before the inline handlers, so the module named in the summary answers.
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/comms/templates":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [comms]
      operationId: get_api_events_eventId_comms_templates
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/comms/templates/{id}":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
      - name: id
        in: path
        required: true
        schema:
          type: string
        description: "id path parameter."
    put:
      tags: [comms]
      operationId: put_api_events_eventId_comms_templates_id
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/content":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [speakers]
      operationId: get_api_events_eventId_content
      summary: "Registered in contentRoutes.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/content/export":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [speakers]
      operationId: get_api_events_eventId_content_export
      summary: "Registered in contentRoutes.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/zip:
              schema:
                type: string
                format: binary
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
    post:
      tags: [speakers]
      operationId: post_api_events_eventId_content_export
      summary: "Registered in contentRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/zip:
              schema:
                type: string
                format: binary
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/content/files/{fileId}/approval":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
      - name: fileId
        in: path
        required: true
        schema:
          type: string
        description: "fileId path parameter."
    patch:
      tags: [speakers]
      operationId: patch_api_events_eventId_content_files_fileId_approval
      summary: "Registered in contentRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/content/files/{fileId}/versions/{versionId}":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
      - name: fileId
        in: path
        required: true
        schema:
          type: string
        description: "fileId path parameter."
      - name: versionId
        in: path
        required: true
        schema:
          type: string
        description: "versionId path parameter."
    get:
      tags: [speakers]
      operationId: get_api_events_eventId_content_files_fileId_versions_versionId
      summary: "Registered in contentRoutes.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/content/history/{historyId}/restore":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
      - name: historyId
        in: path
        required: true
        schema:
          type: string
        description: "historyId path parameter."
    post:
      tags: [speakers]
      operationId: post_api_events_eventId_content_history_historyId_restore
      summary: "Registered in contentRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/content/reminders":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    post:
      tags: [speakers]
      operationId: post_api_events_eventId_content_reminders
      summary: "Registered in contentRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/content/sessions/{sessionId}":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
      - name: sessionId
        in: path
        required: true
        schema:
          type: string
        description: "sessionId path parameter."
    patch:
      tags: [speakers]
      operationId: patch_api_events_eventId_content_sessions_sessionId
      summary: "Registered in contentRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/content/speakers/{speakerId}":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
      - name: speakerId
        in: path
        required: true
        schema:
          type: string
        description: "speakerId path parameter."
    patch:
      tags: [speakers]
      operationId: patch_api_events_eventId_content_speakers_speakerId
      summary: "Registered in contentRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/content/tasks":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    post:
      tags: [speakers]
      operationId: post_api_events_eventId_content_tasks
      summary: "Registered in contentRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/dashboard":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [events]
      operationId: get_api_events_eventId_dashboard
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/embed-configs":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [events]
      operationId: get_api_events_eventId_embed_configs
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
    post:
      tags: [events]
      operationId: post_api_events_eventId_embed_configs
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/embed-configs/{id}":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
      - name: id
        in: path
        required: true
        schema:
          type: string
        description: "id path parameter."
    delete:
      tags: [events]
      operationId: delete_api_events_eventId_embed_configs_id
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/forms":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [submissions]
      operationId: get_api_events_eventId_forms
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
    post:
      tags: [submissions]
      operationId: post_api_events_eventId_forms
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/forms/{id}":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
      - name: id
        in: path
        required: true
        schema:
          type: string
        description: "id path parameter."
    get:
      tags: [submissions]
      operationId: get_api_events_eventId_forms_id
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
    put:
      tags: [submissions]
      operationId: put_api_events_eventId_forms_id
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/resources":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [events]
      operationId: get_api_events_eventId_resources
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
    post:
      tags: [events]
      operationId: post_api_events_eventId_resources
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/resources/{id}":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
      - name: id
        in: path
        required: true
        schema:
          type: string
        description: "id path parameter."
    put:
      tags: [events]
      operationId: put_api_events_eventId_resources_id
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
    delete:
      tags: [events]
      operationId: delete_api_events_eventId_resources_id
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/review-assignments":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    post:
      tags: [reviews]
      operationId: post_api_events_eventId_review_assignments
      summary: "Registered in reviewRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/review-assignments/{assignmentId}/reinstate":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
      - name: assignmentId
        in: path
        required: true
        schema:
          type: string
        description: "assignmentId path parameter."
    post:
      tags: [reviews]
      operationId: post_api_events_eventId_review_assignments_assignmentId_reinstate
      summary: "Registered in reviewRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/review-progress":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [reviews]
      operationId: get_api_events_eventId_review_progress
      summary: "Registered in reviewRoutes.ts. See docs/API.md for role and behaviour notes."
      parameters:
        - name: roundId
          in: query
          required: false
          schema:
            type: string
          description: "roundId filter parameter."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/review-recusals":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [reviews]
      operationId: get_api_events_eventId_review_recusals
      summary: "Registered in reviewRoutes.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/review-reminders":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    post:
      tags: [reviews]
      operationId: post_api_events_eventId_review_reminders
      summary: "Registered in reviewRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/review-results":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [reviews]
      operationId: get_api_events_eventId_review_results
      summary: "Registered in reviewRoutes.ts. See docs/API.md for role and behaviour notes."
      parameters:
        - name: roundId
          in: query
          required: false
          schema:
            type: string
          description: "roundId filter parameter."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/review-results.csv":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [reviews]
      operationId: get_api_events_eventId_review_results_csv
      summary: "Registered in reviewRoutes.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            text/csv:
              schema:
                type: string
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/review-rounds":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [reviews]
      operationId: get_api_events_eventId_review_rounds
      summary: "Registered in reviewRoutes.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
    post:
      tags: [reviews]
      operationId: post_api_events_eventId_review_rounds
      summary: "Registered in reviewRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/review-rounds/{id}":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
      - name: id
        in: path
        required: true
        schema:
          type: string
        description: "id path parameter."
    put:
      tags: [reviews]
      operationId: put_api_events_eventId_review_rounds_id
      summary: "Registered in reviewRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
    delete:
      tags: [reviews]
      operationId: delete_api_events_eventId_review_rounds_id
      summary: "Registered in reviewRoutes.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/review-rounds/{id}/reviewers":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
      - name: id
        in: path
        required: true
        schema:
          type: string
        description: "id path parameter."
    post:
      tags: [reviews]
      operationId: post_api_events_eventId_review_rounds_id_reviewers
      summary: "Registered in reviewRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/review-rounds/{roundId}/invite-emails":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
      - name: roundId
        in: path
        required: true
        schema:
          type: string
        description: "roundId path parameter."
    post:
      tags: [reviews]
      operationId: post_api_events_eventId_review_rounds_roundId_invite_emails
      summary: "Registered in reviewRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/reviewer-queue":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [reviews]
      operationId: get_api_events_eventId_reviewer_queue
      summary: "Registered in reviewRoutes.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/reviewer-queue/{assignmentId}/recuse":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
      - name: assignmentId
        in: path
        required: true
        schema:
          type: string
        description: "assignmentId path parameter."
    post:
      tags: [reviews]
      operationId: post_api_events_eventId_reviewer_queue_assignmentId_recuse
      summary: "Registered in reviewRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/reviewer-queue/{assignmentId}/submit":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
      - name: assignmentId
        in: path
        required: true
        schema:
          type: string
        description: "assignmentId path parameter."
    post:
      tags: [reviews]
      operationId: post_api_events_eventId_reviewer_queue_assignmentId_submit
      summary: "Registered in reviewRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/reviewer-queue/{assignmentOrSubmissionId}":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
      - name: assignmentOrSubmissionId
        in: path
        required: true
        schema:
          type: string
        description: "assignmentOrSubmissionId path parameter."
    get:
      tags: [reviews]
      operationId: get_api_events_eventId_reviewer_queue_assignmentOrSubmissionId
      summary: "Registered in reviewRoutes.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/reviewers/{reviewerId}/invite-link":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
      - name: reviewerId
        in: path
        required: true
        schema:
          type: string
        description: "reviewerId path parameter."
    post:
      tags: [reviews]
      operationId: post_api_events_eventId_reviewers_reviewerId_invite_link
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/reviews":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [reviews]
      operationId: get_api_events_eventId_reviews
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/reviews/{id}":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
      - name: id
        in: path
        required: true
        schema:
          type: string
        description: "id path parameter."
    post:
      tags: [reviews]
      operationId: post_api_events_eventId_reviews_id
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/reviews/{id}/ai-assist":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
      - name: id
        in: path
        required: true
        schema:
          type: string
        description: "id path parameter."
    post:
      tags: [reviews]
      operationId: post_api_events_eventId_reviews_id_ai_assist
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/schedule":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [schedule-agenda]
      operationId: get_api_events_eventId_schedule
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/schedule/move":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    post:
      tags: [schedule-agenda]
      operationId: post_api_events_eventId_schedule_move
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/schedule/sessions":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    post:
      tags: [schedule-agenda]
      operationId: post_api_events_eventId_schedule_sessions
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/schedule/sessions/{sessionId}":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
      - name: sessionId
        in: path
        required: true
        schema:
          type: string
        description: "sessionId path parameter."
    patch:
      tags: [schedule-agenda]
      operationId: patch_api_events_eventId_schedule_sessions_sessionId
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/schedule/validate":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    post:
      tags: [schedule-agenda]
      operationId: post_api_events_eventId_schedule_validate
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/settings":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    put:
      tags: [events]
      operationId: put_api_events_eventId_settings
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/speakers":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [speakers]
      operationId: get_api_events_eventId_speakers
      summary: "Registered in speakerRoutes.ts. See docs/API.md for role and behaviour notes."
      description: >-
        This path and method is registered in more than one module. Sub applications are
        mounted before the inline handlers, so the module named in the summary answers.
      parameters:
        - name: q
          in: query
          required: false
          schema:
            type: string
          description: "q filter parameter."
        - name: readiness
          in: query
          required: false
          schema:
            type: string
          description: "readiness filter parameter."
        - name: status
          in: query
          required: false
          schema:
            type: string
          description: "status filter parameter."
        - name: tag
          in: query
          required: false
          schema:
            type: string
          description: "tag filter parameter."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
    post:
      tags: [speakers]
      operationId: post_api_events_eventId_speakers
      summary: "Registered in speakerRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/speakers/import":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    post:
      tags: [speakers]
      operationId: post_api_events_eventId_speakers_import
      summary: "Registered in speakerRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/speakers/merge":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    post:
      tags: [speakers]
      operationId: post_api_events_eventId_speakers_merge
      summary: "Registered in speakerRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/speakers/merge-suggestions":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [speakers]
      operationId: get_api_events_eventId_speakers_merge_suggestions
      summary: "Registered in speakerRoutes.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
    post:
      tags: [speakers]
      operationId: post_api_events_eventId_speakers_merge_suggestions
      summary: "Registered in speakerRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/speakers/progress":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [speakers]
      operationId: get_api_events_eventId_speakers_progress
      summary: "Registered in speakerRoutes.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/speakers/tasks":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    post:
      tags: [speakers]
      operationId: post_api_events_eventId_speakers_tasks
      summary: "Registered in speakerRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/speakers/{speakerId}":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
      - name: speakerId
        in: path
        required: true
        schema:
          type: string
        description: "speakerId path parameter."
    get:
      tags: [speakers]
      operationId: get_api_events_eventId_speakers_speakerId
      summary: "Registered in speakerRoutes.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
    patch:
      tags: [speakers]
      operationId: patch_api_events_eventId_speakers_speakerId
      summary: "Registered in speakerRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/speakers/{speakerId}/invite":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
      - name: speakerId
        in: path
        required: true
        schema:
          type: string
        description: "speakerId path parameter."
    post:
      tags: [speakers]
      operationId: post_api_events_eventId_speakers_speakerId_invite
      summary: "Registered in speakerRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/speakers/{speakerId}/sessions/{sessionId}/link":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
      - name: speakerId
        in: path
        required: true
        schema:
          type: string
        description: "speakerId path parameter."
      - name: sessionId
        in: path
        required: true
        schema:
          type: string
        description: "sessionId path parameter."
    post:
      tags: [speakers]
      operationId: post_api_events_eventId_speakers_speakerId_sessions_sessionId_link
      summary: "Registered in speakerRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/speakers/{speakerId}/status":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
      - name: speakerId
        in: path
        required: true
        schema:
          type: string
        description: "speakerId path parameter."
    post:
      tags: [speakers]
      operationId: post_api_events_eventId_speakers_speakerId_status
      summary: "Registered in speakerRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/submissions":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [submissions]
      operationId: get_api_events_eventId_submissions
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      parameters:
        - name: filter
          in: query
          required: false
          schema:
            type: string
          description: "filter filter parameter."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/submissions/{id}":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
      - name: id
        in: path
        required: true
        schema:
          type: string
        description: "id path parameter."
    get:
      tags: [submissions]
      operationId: get_api_events_eventId_submissions_id
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/submissions/{id}/decision":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
      - name: id
        in: path
        required: true
        schema:
          type: string
        description: "id path parameter."
    post:
      tags: [submissions]
      operationId: post_api_events_eventId_submissions_id_decision
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/events/{eventId}/submissions/{submissionId}/assignments":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
      - name: submissionId
        in: path
        required: true
        schema:
          type: string
        description: "submissionId path parameter."
    get:
      tags: [submissions]
      operationId: get_api_events_eventId_submissions_submissionId_assignments
      summary: "Registered in reviewRoutes.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  /api/internal/automation/run:
    post:
      tags: [comms]
      operationId: post_api_internal_automation_run
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  /api/openapi.yaml:
    get:
      tags: [meta]
      operationId: get_api_openapi_yaml
      summary: "This OpenAPI document, served as YAML from a string embedded in the Worker bundle."
      description: >-
        Registered in app.ts from the OPENAPI_PATH and OPENAPI_YAML exports in
        src/openapi.ts. The document is embedded in the bundle rather than read from
        disk, because Cloudflare Workers have no filesystem at runtime. No request
        body and no identity headers are required.
      responses:
        '200':
          description: Successful response.
          content:
            text/yaml:
              schema:
                type: string
                description: OpenAPI 3.1 document describing this API.
  "/api/public/events/{slug}/cfp":
    parameters:
      - name: slug
        in: path
        required: true
        schema:
          type: string
        description: "slug path parameter."
    get:
      tags: [cfp-public]
      operationId: get_api_public_events_slug_cfp
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/public/events/{slug}/cfp/{formId}":
    parameters:
      - name: slug
        in: path
        required: true
        schema:
          type: string
        description: "slug path parameter."
      - name: formId
        in: path
        required: true
        schema:
          type: string
        description: "formId path parameter."
    get:
      tags: [cfp-public]
      operationId: get_api_public_events_slug_cfp_formId
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/public/events/{slug}/program":
    parameters:
      - name: slug
        in: path
        required: true
        schema:
          type: string
        description: "slug path parameter."
    get:
      tags: [cfp-public]
      operationId: get_api_public_events_slug_program
      summary: "Registered in publicSite.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/public/events/{slug}/schedule":
    parameters:
      - name: slug
        in: path
        required: true
        schema:
          type: string
        description: "slug path parameter."
    get:
      tags: [cfp-public]
      operationId: get_api_public_events_slug_schedule
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/public/events/{slug}/speakers":
    parameters:
      - name: slug
        in: path
        required: true
        schema:
          type: string
        description: "slug path parameter."
    get:
      tags: [cfp-public]
      operationId: get_api_public_events_slug_speakers
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/public/events/{slug}/submissions":
    parameters:
      - name: slug
        in: path
        required: true
        schema:
          type: string
        description: "slug path parameter."
    post:
      tags: [submissions]
      operationId: post_api_public_events_slug_submissions
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/public/events/{slug}/submissions/{id}":
    parameters:
      - name: slug
        in: path
        required: true
        schema:
          type: string
        description: "slug path parameter."
      - name: id
        in: path
        required: true
        schema:
          type: string
        description: "id path parameter."
    get:
      tags: [submissions]
      operationId: get_api_public_events_slug_submissions_id
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      parameters:
        - name: token
          in: query
          required: false
          schema:
            type: string
          description: "token filter parameter."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
    put:
      tags: [submissions]
      operationId: put_api_public_events_slug_submissions_id
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/public/reviewer-invites/{token}":
    parameters:
      - name: token
        in: path
        required: true
        schema:
          type: string
        description: "token path parameter."
    get:
      tags: [cfp-public]
      operationId: get_api_public_reviewer_invites_token
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/public/speaker-invites/{token}":
    parameters:
      - name: token
        in: path
        required: true
        schema:
          type: string
        description: "token path parameter."
    get:
      tags: [cfp-public]
      operationId: get_api_public_speaker_invites_token
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/speaker/events/{eventId}/deliverables":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [speakers]
      operationId: get_api_speaker_events_eventId_deliverables
      summary: "Registered in contentRoutes.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/speaker/events/{eventId}/deliverables/{taskId}":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
      - name: taskId
        in: path
        required: true
        schema:
          type: string
        description: "taskId path parameter."
    get:
      tags: [speakers]
      operationId: get_api_speaker_events_eventId_deliverables_taskId
      summary: "Registered in contentRoutes.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/speaker/events/{eventId}/deliverables/{taskId}/upload":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
      - name: taskId
        in: path
        required: true
        schema:
          type: string
        description: "taskId path parameter."
    post:
      tags: [speakers]
      operationId: post_api_speaker_events_eventId_deliverables_taskId_upload
      summary: "Registered in contentRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/speaker/events/{eventId}/files":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    post:
      tags: [speakers]
      operationId: post_api_speaker_events_eventId_files
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/speaker/events/{eventId}/home":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [speakers]
      operationId: get_api_speaker_events_eventId_home
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/speaker/events/{eventId}/profile":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    put:
      tags: [speakers]
      operationId: put_api_speaker_events_eventId_profile
      summary: "Registered in speakerRoutes.ts. See docs/API.md for role and behaviour notes."
      description: >-
        This path and method is registered in more than one module. Sub applications are
        mounted before the inline handlers, so the module named in the summary answers.
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/speaker/events/{eventId}/profile/headshot":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    post:
      tags: [speakers]
      operationId: post_api_speaker_events_eventId_profile_headshot
      summary: "Registered in speakerRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/speaker/events/{eventId}/resources":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [speakers]
      operationId: get_api_speaker_events_eventId_resources
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/speaker/events/{eventId}/resources/{slug}":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
      - name: slug
        in: path
        required: true
        schema:
          type: string
        description: "slug path parameter."
    get:
      tags: [speakers]
      operationId: get_api_speaker_events_eventId_resources_slug
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/speaker/events/{eventId}/submissions/{id}":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
      - name: id
        in: path
        required: true
        schema:
          type: string
        description: "id path parameter."
    put:
      tags: [speakers]
      operationId: put_api_speaker_events_eventId_submissions_id
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/speaker/events/{eventId}/tasks":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [speakers]
      operationId: get_api_speaker_events_eventId_tasks
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/speaker/events/{eventId}/tasks/{id}":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
      - name: id
        in: path
        required: true
        schema:
          type: string
        description: "id path parameter."
    get:
      tags: [speakers]
      operationId: get_api_speaker_events_eventId_tasks_id
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
    patch:
      tags: [speakers]
      operationId: patch_api_speaker_events_eventId_tasks_id
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/api/speaker/events/{eventId}/tasks/{id}/form":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
      - name: id
        in: path
        required: true
        schema:
          type: string
        description: "id path parameter."
    post:
      tags: [speakers]
      operationId: post_api_speaker_events_eventId_tasks_id_form
      summary: "Registered in speakerRoutes.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  /api/demo:
    get:
      tags: [meta]
      operationId: get_demo
      summary: "Canonical demo data snapshot for the seeded event."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  /docs/api:
    get:
      tags: [meta]
      operationId: get_docs_api
      summary: "Human readable API documentation page, rendered from the OpenAPI document."
      description: >-
        Server rendered HTML listing every operation grouped by tag, with quick start
        curl examples and a link to the machine readable spec. Registered in
        publicSite.ts and requires no identity headers.
      responses:
        '200':
          description: Successful response.
          content:
            text/html:
              schema:
                type: string
  "/e/{slug}/public":
    parameters:
      - name: slug
        in: path
        required: true
        schema:
          type: string
        description: "slug path parameter."
    get:
      tags: [public-widgets]
      operationId: get_e_slug_public
      summary: "Registered in publicSite.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            text/html:
              schema:
                type: string
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/e/{slug}/public/agenda":
    parameters:
      - name: slug
        in: path
        required: true
        schema:
          type: string
        description: "slug path parameter."
    get:
      tags: [public-widgets]
      operationId: get_e_slug_public_agenda
      summary: "Registered in publicSite.ts. See docs/API.md for role and behaviour notes."
      parameters:
        - name: config
          in: query
          required: false
          schema:
            type: string
          description: "config filter parameter."
        - name: day
          in: query
          required: false
          schema:
            type: string
          description: "day filter parameter."
      responses:
        '200':
          description: Successful response.
          content:
            text/html:
              schema:
                type: string
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/e/{slug}/public/agenda.json":
    parameters:
      - name: slug
        in: path
        required: true
        schema:
          type: string
        description: "slug path parameter."
    get:
      tags: [public-widgets]
      operationId: get_e_slug_public_agenda_json
      summary: "Registered in publicSite.ts. See docs/API.md for role and behaviour notes."
      parameters:
        - name: day
          in: query
          required: false
          schema:
            type: string
          description: "day filter parameter."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/e/{slug}/public/agenda.xml":
    parameters:
      - name: slug
        in: path
        required: true
        schema:
          type: string
        description: "slug path parameter."
    get:
      tags: [public-widgets]
      operationId: get_e_slug_public_agenda_xml
      summary: "Registered in publicSite.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/xml:
              schema:
                type: string
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/e/{slug}/public/feed.json":
    parameters:
      - name: slug
        in: path
        required: true
        schema:
          type: string
        description: "slug path parameter."
    get:
      tags: [public-widgets]
      operationId: get_e_slug_public_feed_json
      summary: "Registered in publicSite.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/e/{slug}/public/feed.xml":
    parameters:
      - name: slug
        in: path
        required: true
        schema:
          type: string
        description: "slug path parameter."
    get:
      tags: [public-widgets]
      operationId: get_e_slug_public_feed_xml
      summary: "Registered in publicSite.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/xml:
              schema:
                type: string
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/e/{slug}/public/gallery":
    parameters:
      - name: slug
        in: path
        required: true
        schema:
          type: string
        description: "slug path parameter."
    get:
      tags: [public-widgets]
      operationId: get_e_slug_public_gallery
      summary: "Registered in publicSite.ts. See docs/API.md for role and behaviour notes."
      parameters:
        - name: config
          in: query
          required: false
          schema:
            type: string
          description: "config filter parameter."
      responses:
        '200':
          description: Successful response.
          content:
            text/html:
              schema:
                type: string
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/e/{slug}/public/gallery.xml":
    parameters:
      - name: slug
        in: path
        required: true
        schema:
          type: string
        description: "slug path parameter."
    get:
      tags: [public-widgets]
      operationId: get_e_slug_public_gallery_xml
      summary: "Registered in publicSite.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/xml:
              schema:
                type: string
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/e/{slug}/public/ics":
    parameters:
      - name: slug
        in: path
        required: true
        schema:
          type: string
        description: "slug path parameter."
    get:
      tags: [public-widgets]
      operationId: get_e_slug_public_ics
      summary: "Registered in publicSite.ts. See docs/API.md for role and behaviour notes."
      parameters:
        - name: day
          in: query
          required: false
          schema:
            type: string
          description: "day filter parameter."
        - name: ids
          in: query
          required: false
          schema:
            type: string
          description: "ids filter parameter."
      responses:
        '200':
          description: Successful response.
          content:
            text/calendar:
              schema:
                type: string
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/e/{slug}/public/itinerary":
    parameters:
      - name: slug
        in: path
        required: true
        schema:
          type: string
        description: "slug path parameter."
    get:
      tags: [public-widgets]
      operationId: get_e_slug_public_itinerary
      summary: "Registered in publicSite.ts. See docs/API.md for role and behaviour notes."
      parameters:
        - name: config
          in: query
          required: false
          schema:
            type: string
          description: "config filter parameter."
      responses:
        '200':
          description: Successful response.
          content:
            text/html:
              schema:
                type: string
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/e/{slug}/public/itinerary.xml":
    parameters:
      - name: slug
        in: path
        required: true
        schema:
          type: string
        description: "slug path parameter."
    get:
      tags: [public-widgets]
      operationId: get_e_slug_public_itinerary_xml
      summary: "Registered in publicSite.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/xml:
              schema:
                type: string
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/e/{slug}/public/sessions":
    parameters:
      - name: slug
        in: path
        required: true
        schema:
          type: string
        description: "slug path parameter."
    get:
      tags: [public-widgets]
      operationId: get_e_slug_public_sessions
      summary: "Registered in publicSite.ts. See docs/API.md for role and behaviour notes."
      parameters:
        - name: config
          in: query
          required: false
          schema:
            type: string
          description: "config filter parameter."
      responses:
        '200':
          description: Successful response.
          content:
            text/html:
              schema:
                type: string
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/e/{slug}/public/sessions.json":
    parameters:
      - name: slug
        in: path
        required: true
        schema:
          type: string
        description: "slug path parameter."
    get:
      tags: [public-widgets]
      operationId: get_e_slug_public_sessions_json
      summary: "Registered in publicSite.ts. See docs/API.md for role and behaviour notes."
      parameters:
        - name: day
          in: query
          required: false
          schema:
            type: string
          description: "day filter parameter."
        - name: format
          in: query
          required: false
          schema:
            type: string
          description: "format filter parameter."
        - name: q
          in: query
          required: false
          schema:
            type: string
          description: "q filter parameter."
        - name: room
          in: query
          required: false
          schema:
            type: string
          description: "room filter parameter."
        - name: track
          in: query
          required: false
          schema:
            type: string
          description: "track filter parameter."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/e/{slug}/public/sessions.xml":
    parameters:
      - name: slug
        in: path
        required: true
        schema:
          type: string
        description: "slug path parameter."
    get:
      tags: [public-widgets]
      operationId: get_e_slug_public_sessions_xml
      summary: "Registered in publicSite.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/xml:
              schema:
                type: string
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/e/{slug}/public/sessions/{id}":
    parameters:
      - name: slug
        in: path
        required: true
        schema:
          type: string
        description: "slug path parameter."
      - name: id
        in: path
        required: true
        schema:
          type: string
        description: "id path parameter."
    get:
      tags: [public-widgets]
      operationId: get_e_slug_public_sessions_id
      summary: "Registered in publicSite.ts. See docs/API.md for role and behaviour notes."
      parameters:
        - name: day
          in: query
          required: false
          schema:
            type: string
          description: "day filter parameter."
        - name: from
          in: query
          required: false
          schema:
            type: string
          description: "from filter parameter."
      responses:
        '200':
          description: Successful response.
          content:
            text/html:
              schema:
                type: string
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/e/{slug}/public/speakers":
    parameters:
      - name: slug
        in: path
        required: true
        schema:
          type: string
        description: "slug path parameter."
    get:
      tags: [public-widgets]
      operationId: get_e_slug_public_speakers
      summary: "Registered in publicSite.ts. See docs/API.md for role and behaviour notes."
      parameters:
        - name: config
          in: query
          required: false
          schema:
            type: string
          description: "config filter parameter."
      responses:
        '200':
          description: Successful response.
          content:
            text/html:
              schema:
                type: string
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/e/{slug}/public/speakers.json":
    parameters:
      - name: slug
        in: path
        required: true
        schema:
          type: string
        description: "slug path parameter."
    get:
      tags: [public-widgets]
      operationId: get_e_slug_public_speakers_json
      summary: "Registered in publicSite.ts. See docs/API.md for role and behaviour notes."
      parameters:
        - name: q
          in: query
          required: false
          schema:
            type: string
          description: "q filter parameter."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/e/{slug}/public/speakers.xml":
    parameters:
      - name: slug
        in: path
        required: true
        schema:
          type: string
        description: "slug path parameter."
    get:
      tags: [public-widgets]
      operationId: get_e_slug_public_speakers_xml
      summary: "Registered in publicSite.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/xml:
              schema:
                type: string
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/e/{slug}/public/speakers/{id}":
    parameters:
      - name: slug
        in: path
        required: true
        schema:
          type: string
        description: "slug path parameter."
      - name: id
        in: path
        required: true
        schema:
          type: string
        description: "id path parameter."
    get:
      tags: [public-widgets]
      operationId: get_e_slug_public_speakers_id
      summary: "Registered in publicSite.ts. See docs/API.md for role and behaviour notes."
      parameters:
        - name: from
          in: query
          required: false
          schema:
            type: string
          description: "from filter parameter."
      responses:
        '200':
          description: Successful response.
          content:
            text/html:
              schema:
                type: string
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/embed/{eventId}/agenda":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [public-widgets]
      operationId: get_embed_eventId_agenda
      summary: "Registered in publicSite.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            text/html:
              schema:
                type: string
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/embed/{eventId}/gallery":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [public-widgets]
      operationId: get_embed_eventId_gallery
      summary: "Registered in publicSite.ts. See docs/API.md for role and behaviour notes."
      description: >-
        This path and method is registered in more than one module. Sub applications are
        mounted before the inline handlers, so the module named in the summary answers.
      responses:
        '200':
          description: Successful response.
          content:
            text/html:
              schema:
                type: string
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/embed/{eventId}/itinerary":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [public-widgets]
      operationId: get_embed_eventId_itinerary
      summary: "Registered in publicSite.ts. See docs/API.md for role and behaviour notes."
      description: >-
        This path and method is registered in more than one module. Sub applications are
        mounted before the inline handlers, so the module named in the summary answers.
      responses:
        '200':
          description: Successful response.
          content:
            text/html:
              schema:
                type: string
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/embed/{eventId}/sessions":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [public-widgets]
      operationId: get_embed_eventId_sessions
      summary: "Registered in publicSite.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            text/html:
              schema:
                type: string
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/embed/{eventId}/speakers":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [public-widgets]
      operationId: get_embed_eventId_speakers
      summary: "Registered in publicSite.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            text/html:
              schema:
                type: string
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  /health:
    get:
      tags: [meta]
      operationId: get_health
      summary: "Service health plus the configured Accelevents client mode."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/public/events/{eventId}/agenda":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [public-widgets]
      operationId: get_public_events_eventId_agenda
      summary: "Registered in publicSite.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            text/html:
              schema:
                type: string
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/public/events/{eventId}/agenda.xml":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [public-widgets]
      operationId: get_public_events_eventId_agenda_xml
      summary: "Registered in publicSite.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/xml:
              schema:
                type: string
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/public/events/{eventId}/feed.json":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [public-widgets]
      operationId: get_public_events_eventId_feed_json
      summary: "Registered in publicSite.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/public/events/{eventId}/feed.xml":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [public-widgets]
      operationId: get_public_events_eventId_feed_xml
      summary: "Registered in publicSite.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/xml:
              schema:
                type: string
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/public/events/{eventId}/gallery":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [public-widgets]
      operationId: get_public_events_eventId_gallery
      summary: "Registered in publicSite.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            text/html:
              schema:
                type: string
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/public/events/{eventId}/ics":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [public-widgets]
      operationId: get_public_events_eventId_ics
      summary: "Registered in publicSite.ts. See docs/API.md for role and behaviour notes."
      parameters:
        - name: ids
          in: query
          required: false
          schema:
            type: string
          description: "ids filter parameter."
      responses:
        '200':
          description: Successful response.
          content:
            text/calendar:
              schema:
                type: string
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/public/events/{eventId}/itinerary":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [public-widgets]
      operationId: get_public_events_eventId_itinerary
      summary: "Registered in publicSite.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            text/html:
              schema:
                type: string
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/public/events/{eventId}/itinerary.json":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [public-widgets]
      operationId: get_public_events_eventId_itinerary_json
      summary: "Registered in publicSite.ts. See docs/API.md for role and behaviour notes."
      description: >-
        This path and method is registered in more than one module. Sub applications are
        mounted before the inline handlers, so the module named in the summary answers.
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/public/events/{eventId}/sessions":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [public-widgets]
      operationId: get_public_events_eventId_sessions
      summary: "Registered in publicSite.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            text/html:
              schema:
                type: string
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/public/events/{eventId}/sessions.xml":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [public-widgets]
      operationId: get_public_events_eventId_sessions_xml
      summary: "Registered in publicSite.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/xml:
              schema:
                type: string
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/public/events/{eventId}/speakers":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [public-widgets]
      operationId: get_public_events_eventId_speakers
      summary: "Registered in publicSite.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            text/html:
              schema:
                type: string
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/public/events/{eventId}/speakers.json":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [public-widgets]
      operationId: get_public_events_eventId_speakers_json
      summary: "Registered in publicSite.ts. See docs/API.md for role and behaviour notes."
      description: >-
        This path and method is registered in more than one module. Sub applications are
        mounted before the inline handlers, so the module named in the summary answers.
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/public/events/{eventId}/speakers.xml":
    parameters:
      - name: eventId
        in: path
        required: true
        schema:
          type: string
        description: "eventId path parameter."
    get:
      tags: [public-widgets]
      operationId: get_public_events_eventId_speakers_xml
      summary: "Registered in publicSite.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/xml:
              schema:
                type: string
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  /sync/preview:
    post:
      tags: [sync]
      operationId: post_sync_preview
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  /sync/run:
    post:
      tags: [sync]
      operationId: post_sync_run
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  /sync/runs:
    get:
      tags: [sync]
      operationId: get_sync_runs
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      parameters:
        - name: eventId
          in: query
          required: false
          schema:
            type: string
          description: "eventId filter parameter."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/sync/runs/{id}":
    parameters:
      - name: id
        in: path
        required: true
        schema:
          type: string
        description: "id path parameter."
    get:
      tags: [sync]
      operationId: get_sync_runs_id
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      responses:
        '200':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
  "/sync/runs/{id}/retry":
    parameters:
      - name: id
        in: path
        required: true
        schema:
          type: string
        description: "id path parameter."
    post:
      tags: [sync]
      operationId: post_sync_runs_id_retry
      summary: "Registered in app.ts. See docs/API.md for role and behaviour notes."
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/JsonObject'
      responses:
        '201':
          description: Successful response.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '200':
          description: Successful response for operations that update in place.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DataEnvelope'
        '400':
          description: Validation error.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '403':
          description: Demo role or ownership scope rejected the request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
        '404':
          description: Event, record or route target was not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorEnvelope'
components:
  schemas:
    JsonObject:
      type: object
      additionalProperties: true
      description: >-
        Loosely typed JSON request body. Handlers read the fields they need and ignore
        the rest; see docs/API.md for the fields each operation consumes.
    DataEnvelope:
      type: object
      additionalProperties: true
      description: >-
        Standard success envelope. Most JSON endpoints return a data property holding an
        object or array; some also return meta describing counts or provider outcomes.
      properties:
        data:
          description: Operation payload, either an object or an array.
        meta:
          type: object
          additionalProperties: true
          description: Optional counts, filters or provider status details.
    ErrorEnvelope:
      type: object
      additionalProperties: true
      description: Standard failure envelope returned by the shared error helper.
      properties:
        error:
          type: object
          additionalProperties: true
          properties:
            code:
              type: string
              description: Short machine readable code such as NOT_FOUND or VALIDATION_ERROR.
            message:
              type: string
              description: Human readable explanation.
`;

/** Content type to use when serving OPENAPI_YAML over HTTP. */
export const OPENAPI_CONTENT_TYPE = "text/yaml; charset=utf-8";

/** Path the document is intended to be served from. */
export const OPENAPI_PATH = "/api/openapi.yaml";
