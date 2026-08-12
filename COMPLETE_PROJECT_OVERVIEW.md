# 📚 FlowCAD — Complete Technical & Code Reference Manual

This document provides a comprehensive, component-by-component, and file-by-file technical manual for the **FlowCAD** codebase.

---

## 📂 Codebase Layout

```text
flowcad/
├── backend/                        # Python + FastAPI Service
│   ├── core/                       # Core Infrastructure & Shared Clients
│   │   ├── __init__.py
│   │   ├── config.py              # Pydantic-Settings configuration (.env)
│   │   ├── gemini_client.py       # Singleton Gemini client, model fallbacks, retry logic
│   │   └── supabase_client.py     # Supabase CRUD helper methods & caching
│   ├── models/                     # Data Models & Schemas
│   │   ├── __init__.py
│   │   └── pipeline.py            # Pydantic schemas for Stages 1–9 & ProjectRow
│   ├── routers/                    # FastAPI Per-Stage Endpoint Routers
│   │   ├── health.py              # GET /health
│   │   ├── requirements.py        # POST /extract-requirements (Stage 1)
│   │   ├── architecture.py        # POST /generate-architecture (Stage 2)
│   │   ├── components.py          # POST /select-components (Stage 3)
│   │   ├── schematic.py           # POST /generate-schematic (Stage 4)
│   │   ├── pcb.py                 # POST /generate-pcb (Stage 5)
│   │   ├── placement.py           # POST /place-and-route (Stage 6)
│   │   ├── verification.py        # POST /verify (Stage 7)
│   │   ├── export.py              # POST /export & GET /export/download/{id} (Stage 8)
│   │   ├── edit.py                # POST /apply-edit (Stage 9)
│   │   ├── projects.py            # POST /projects/{id}/generate (Orchestrator + Rate Limits)
│   │   └── pipeline.py            # POST /run-pipeline (Legacy full chain)
│   ├── services/                   # Pure Logic Pipeline Services
│   │   ├── requirement_extractor.py
│   │   ├── architecture_generator.py
│   │   ├── component_selector.py
│   │   ├── schematic_generator.py
│   │   ├── pcb_generator.py
│   │   ├── placer_router.py
│   │   ├── verifier.py
│   │   ├── exporter.py
│   │   ├── edit_commander.py
│   │   └── llm_client.py         # Shim delegating to core/gemini_client.py
│   ├── component_library/
│   │   └── components.json        # Curated electronics catalog (MCUs, sensors, power)
│   ├── skidl_templates/           # Standalone SKiDL Python code generators
│   │   ├── led_blinker.py
│   │   ├── dht22_sensor.py
│   │   └── irrigation_controller.py
│   ├── supabase/
│   │   └── migrations/
│   │       ├── 001_create_tables.sql
│   │       └── 002_align_frontend_schema.sql
│   ├── tests/
│   │   ├── conftest.py
│   │   └── test_pipeline.py       # Automated Pytest suite
│   ├── main.py                    # FastAPI application entry point
│   ├── requirements.txt           # Python dependencies
│   └── README.md                  # Backend service documentation
├── src/                            # React 18 + TypeScript Frontend
│   ├── components/flowcad/        # CAD UI Components
│   │   ├── BlockDiagram.tsx       # SVG Architecture block diagram view
│   │   ├── SchematicView.tsx      # Interactive SVG schematic diagram view
│   │   ├── PcbLayout.tsx          # 2D Canvas PCB layout view (copper traces, footprints)
│   │   ├── ThreeDView.tsx         # 3D PCB preview view
│   │   ├── PipelineStepper.tsx    # Real-time 9-stage pipeline stepper
│   │   ├── ContextPanels.tsx      # VerificationPanel, DetailsPanel, BomPanel, AlternativesPanel
│   │   ├── ChatDock.tsx           # Conversational AI prompt terminal
│   │   ├── CanvasEmpty.tsx        # Reusable empty canvas state
│   │   ├── StatusBadge.tsx        # PASS / WARNING / FAIL status pills
│   │   └── Logo.tsx               # FlowCAD branding logo
│   ├── lib/
│   │   ├── design-store.ts        # Reactive CAD State Management (`useSyncExternalStore`)
│   │   ├── flowcad-data.ts        # Design templates, catalog, and verification rules
│   │   └── utils.ts               # Classname utilities (clsx + tailwind-merge)
│   ├── routes/
│   │   ├── index.tsx              # Landing page with prompt bar & feature cards
│   │   ├── workspace.tsx          # Main multi-panel CAD workspace
│   │   └── export.tsx             # Fabrication export download page
│   ├── main.tsx                   # React app root mount
│   └── index.css                  # Global CAD design tokens & CSS custom properties
├── PROJECT_PRESENTATION_GUIDE.md   # Master presentation guide for presentation
└── COMPLETE_PROJECT_OVERVIEW.md   # This comprehensive engineering reference manual
```

---

## 🔍 Module-by-Module Code Analysis

### 1. `backend/core/config.py`
Reads configuration parameters from `.env` via `pydantic-settings`:
- `GEMINI_API_KEY`: Google AI Studio API key.
- `GEMINI_MODEL`: Target model (`models/gemini-2.5-flash`, with auto-fallback to `models/gemini-3.5-flash`).
- `FREE_TIER_MONTHLY_LIMIT`: Free generation limit per user (default: `5`).
- `WORK_DIR`: Scratch directory for generated netlists, KiCad PCBs, and Gerbers (`tmp/`).

### 2. `backend/core/gemini_client.py`
- Maintains a process-wide singleton `genai.Client`.
- Configures `thinking_budget = 0` and `max_output_tokens = 8192` to maximize output token space for JSON payloads.
- **Model Fallback Chain**: Attempts `models/gemini-2.5-flash` $\rightarrow$ `models/gemini-3.5-flash` $\rightarrow$ `models/gemini-3.1-flash-lite`.
- **Error Recovery**: Handles HTTP 429 rate limits using exponential back-off (`[2, 5, 10, 20, 30]s`). Re-prompts the model with error feedback if JSON parsing fails.

### 3. `backend/core/supabase_client.py`
- Connects to Supabase PostgreSQL database using service role keys.
- Operates in best-effort mode: if Supabase is offline, it caches a disabled flag and gracefully allows the pipeline to continue in-memory without crashing.

### 4. `backend/models/pipeline.py`
Defines strict Pydantic schemas:
- `RequirementsOutput`: Extracted microcontroller, sensors, actuators, power constraints, board dimensions.
- `ArchitectureOutput`: Array of `ArchitectureNode` and `ArchitectureEdge`.
- `ComponentsOutput`: Array of `ComponentSelection` (ref, MPN, footprint, package, unit cost, specs).
- `SchematicOutput`: Netlist path, array of `NetEntry`, part list.
- `PlaceRouteOutput`: PCB path, placed count, routed count, unrouted count, `status` (`done` | `partial`), `routed_percentage`, `unrouted_nets`.
- `VerificationOutput`: Scores and notes for 7 checks (Electrical, Power Integrity, Connectivity, ERC, DRC, Manufacturing, Thermal) plus aggregate `confidence` (0–100%).
- `ProjectRow`: Mirrors frontend `projects` table shape.

### 5. `backend/routers/projects.py` (Orchestrator)
Handles `POST /projects/{id}/generate`:
1. Queries `profiles` table to check `generations_this_month < 5`. If limit is reached, returns `HTTP 429`.
2. Marks project `status = "generating"`.
3. Runs Stages 1 through 8 sequentially, updating `projects.design_state` in Supabase after each stage.
4. On completion, updates `status = "done"`, creates an immutable snapshot in `project_versions`, and increments `profiles.generations_this_month`.

### 6. `backend/services/verifier.py`
Implements the **7-Point Verification Engine**:
- `_check_electrical()`: Validates electrical connectivity across all nets.
- `_check_power()`: Checks for `3V3` and `GND` power rails and bulk decoupling capacitors.
- `_check_connectivity()`: Counts nets vs. trace segments; flags unrouted airwires as `WARNING` (`"Routing incomplete: N nets require manual routing"`).
- `_run_erc()`: Parses KiCad ERC XML output.
- `_run_drc()`: Parses KiCad DRC JSON output (flags clearances $< 0.20\text{ mm}$).
- `_check_manufacturing()`: Calculates component area density ($\text{Area}_{\text{parts}} / \text{Area}_{\text{board}}$); flags density $> 42\%$.
- `_check_thermal()`: Computes regulator temperature rise $\Delta T = (V_{\text{in}} - V_{\text{out}}) \times I \times R_{\theta JA}$; flags rise $> 40^\circ\text{C}$.

---

## 🎨 Frontend Architecture & CAD Reactive Store

### 1. `src/lib/design-store.ts` (`useDesign`)
- Built using React 18's `useSyncExternalStore` hook for high-performance, tear-free CAD rendering.
- Manages complete reactive design state: component coordinates (`px`, `py`), selected component (`selected`), verification checks, chat logs, and active generation stages.
- `runGeneration(prompt)`: Iterates through stage definitions, updates stage statuses (`active` $\rightarrow$ `done`), updates canvas panels step-by-step, and catches exceptions cleanly with `console.error`.

### 2. UI Components
- **`PipelineStepper.tsx`**: Displays real-time status (`done`, `active`, `pending`, `warning`) for all 9 stages with active progress counters (e.g. `7 / 9 stages complete`).
- **`BlockDiagram.tsx`**: Interactive SVG functional block diagram.
- **`SchematicView.tsx`**: Schematic canvas rendering component symbols and net connections.
- **`PcbLayout.tsx`**: 2D PCB editor rendering board outline, footprint pads, silkscreen, and copper traces.
- **`ThreeDView.tsx`**: 3D board assembly preview.
- **`ContextPanels.tsx`**: Right sidebar containing `VerificationPanel` (design confidence meter + 7 rule checks), `DetailsPanel`, `BomPanel`, and `AlternativesPanel`.

---

## 🧪 Verification & Testing Commands

To run the automated backend test suite:
```bash
cd backend
source .venv/bin/activate
pytest tests/ -v
```

To run a live pipeline execution test:
```bash
cd backend
source .venv/bin/activate
python -c "
from services.requirement_extractor import extract_requirements
res = extract_requirements('Design an ESP32 irrigation controller with soil moisture sensor and relay.')
print('Microcontroller:', res.microcontroller)
print('Requirements:', len(res.requirements))
"
```

To start the FastAPI development server:
```bash
cd backend
source .venv/bin/activate
uvicorn main:app --reload --port 8000
```
Interactive OpenAPI documentation is available at `http://localhost:8000/docs`.
