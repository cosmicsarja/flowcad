# FlowCAD Project Status Report

## 1. Project Objective (as actually implemented)
FlowCAD currently functions as an end-to-end automated printed circuit board (PCB) design pipeline that takes a natural language prompt and generates a completely functional KiCad project (schematic netlist and PCB layout). The system successfully parses requirements, designs system architecture, selects real KiCad components from native libraries, generates a netlist using SKiDL, performs intelligent rule-based component placement, and validates the design using KiCad's DRC tools. The majority of the pipeline stages are fully working and produce real outputs (including 3D GLB models), though auto-routing remains partially stubbed and relies on static analysis rather than a true topological auto-router. 

## 2. Architecture Overview
**Backend Endpoints (FastAPI):**
- `/extract` — **Fully Implemented**. Uses Gemini for structured requirement parsing.
- `/architecture` — **Fully Implemented**. Uses Gemini to map functional blocks and connections.
- `/select-components` — **Fully Implemented**. Queries a custom in-memory index of native KiCad libraries instead of mock data.
- `/generate-schematic` — **Fully Implemented**. Dynamically writes SKiDL Python code to generate KiCad `.net` netlists.
- `/generate-pcb` — **Fully Implemented**. Uses KiCad's bundled `pcbnew` Python API via a spawned subprocess to build a `.kicad_pcb` board and link footprints.
- `/place-and-route` — **Partially Working**. Smart placement is fully functional using `pcbnew`, but auto-routing is stubbed/mocked (returns track counts instead of performing true autorouting).
- `/verify` — **Fully Implemented**. Runs real `kicad-cli pcb drc`, library integrity checks, and static analysis (since netlist ERC via CLI is unsupported in KiCad 8).
- `/export` — **Fully Implemented**. Generates real Gerber files, drill files, BOM CSV, and a GLB 3D model using `kicad-cli`.
- `/apply-edit` — **Fully Implemented**. Modifies the design state via a regex/keyword-based parser.
- `/export/model/{id}` — **Fully Implemented**. Serves the generated GLB 3D model directly to the frontend viewer.

**Frontend Components (React / Vite / TanStack Router):**
- **Editor / Workspace (`ThreeDView.tsx`, `CadCanvas.tsx`)**: Renders real-time visual feedback. The 3D view currently uses a custom CSS-based pseudo-3D block representation (stylized DOM elements) relying on local state, but has the capability to load native `.glb` files via `<model-viewer>` when configured.
- **Pipeline Progress / Conversational Editor**: Uses a global state store (`design-store.ts`) that orchestrates sequential real API calls to the FastAPI backend and maintains the design state. 
- **Data Flow**: The user submits a prompt → `design-store.ts` orchestrates sequential HTTP POST requests to the backend (`/extract` → `/architecture` → `/select-components` → `/generate-schematic` → `/generate-pcb` → `/place-and-route` → `/verify`) → The UI updates at each stage using the JSON responses → User can apply natural language edits via `/apply-edit` → Finally, `/export` packages the assets.

## 3. Methodology (as actually implemented)
- **Requirement Extraction**: Utilizes the Gemini 3.5 Flash LLM (via `core/gemini_client.py`) with strict JSON schema constraints and a robust 5-attempt retry mechanism with exponential backoff for rate limits.
- **Component Selection**: A custom Python service (`kicad_library.py`) recursively parses local KiCad `.kicad_sym` and `.kicad_mod` S-expression files at startup. It builds a cached in-memory index of over 22,000 standard parts and uses keyword/category matching to filter candidates for the LLM context to prevent token overflow.
- **Schematic/Netlist Generation**: Fully integrates `skidl` (v1.2.3). The backend dynamically converts architecture nodes into native `skidl.Part` objects mapped directly to the verified KiCad library references, generating a standard `.net` netlist.
- **Placement & Routing**: Placement utilizes the `pcbnew` Python API to apply physical placement rules (e.g., categorizing components, placing connectors on board edges, decoupling capacitors near ICs, and calculating bounding boxes). Routing assigns heavier net classes to power/ground nets, but actual trace rendering is mock-simulated.
- **Verification**: Invokes standard `kicad-cli pcb drc` to generate and parse a JSON report of board violations. Also performs custom static analysis on the netlist text to verify electrical connectivity and footprint resolution integrity.
- **Export**: Real `GLB` 3D models and `.gbr` (Gerber X2) files are natively exported by executing `kicad-cli pcb export` commands.

## 4. Algorithms and Techniques Actually Used
- **LLM-based structured extraction**: Gemini function/schema-constrained JSON generation.
- **S-expression parsing & In-memory indexing**: Custom regex-based parsing of native KiCad libraries to build a searchable part index.
- **Rule-based geometry layout**: Heuristic bounding-box sorting and geometric offset calculations via `pcbnew` Python bindings to place components intelligently.
- **Subprocess orchestration**: Heavy utilization of spawned temporary Python scripts run via KiCad's isolated Python environment (`/Applications/KiCad/.../bin/python3`) to bypass virtual environment linking issues.
- **Regex/keyword pattern matching**: Used in the conversational edit command parser to intercept and mutate state without requiring an LLM call.

## 5. Known Gaps / Not Yet Implemented
The following features from the original vision documents are **NOT** present in the current codebase:
- **RL-based Routing**: There is no Reinforcement Learning or actual auto-router implementation; `/place-and-route` relies on mock trace counts for the routing phase.
- **Multi-board Support**: The pipeline assumes a single rigid PCB per project.
- **Live Distributor API Integration**: Component costs and stock data are stubbed/mocked; it does not pull live data from DigiKey/Mouser APIs.
- **Payment Processing**: No Stripe or billing integration exists in the code.
- **True Frontend 3D GLB Rendering**: While the backend accurately generates a `.glb` file, the active frontend UI currently utilizes a stylized CSS-based 3D cube representation instead of loading the GLB via Three.js (though the codebase contains the scaffolding for this).
