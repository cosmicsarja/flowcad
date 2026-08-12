# FlowCAD Backend — Pipeline API

AI-powered Prompt-to-PCB backend service. Takes a natural-language circuit description and produces a verified PCB design: schematic, netlist, placement, routing, ERC/DRC verification, 3D model, and manufacturing files.

---

## Architecture

```
backend/
├── main.py                       FastAPI app entry point
├── requirements.txt              Python dependencies
├── .env.example                  Environment variable template
│
├── routers/
│   ├── health.py                 GET /health
│   └── pipeline.py               All 9 pipeline endpoints
│
├── services/
│   ├── llm_client.py             Claude / OpenAI shim
│   ├── requirement_extractor.py  Stage 1: prompt → structured requirements
│   ├── architecture_generator.py Stage 2: requirements → block diagram
│   ├── component_selector.py     Stage 3: architecture → BOM components
│   ├── schematic_generator.py    Stage 4: SKiDL netlist generation
│   ├── pcb_generator.py          Stage 5: netlist → .kicad_pcb
│   ├── placer_router.py          Stage 6: placement + routing
│   ├── verifier.py               Stage 7: ERC + DRC (deterministic)
│   ├── exporter.py               Stage 8: Gerbers, BOM, STEP, report
│   ├── edit_commander.py         Stage 9: apply-edit command parser
│   └── supabase_client.py        Persistence helper (non-fatal)
│
├── component_library/
│   └── components.json           30-part curated library
│
├── schemas/
│   └── requirements.py           All Pydantic v2 models
│
├── kicad_scripts/
│   ├── import_netlist.py         pcbnew: load netlist → PCB
│   ├── auto_place.py             pcbnew: grid placer
│   ├── auto_route.py             pcbnew: routing wrapper
│   ├── run_erc.py                kicad-cli: ERC → parse XML
│   ├── run_drc.py                kicad-cli: DRC → parse JSON
│   └── export_fab.py             kicad-cli: Gerbers + drill + STEP
│
└── skidl_templates/
    ├── led_blinker.py            Test circuit 1
    ├── dht22_sensor.py           Test circuit 2
    └── irrigation_controller.py  Test circuit 3
```

---

## Quick Start

### 1. Prerequisites

- Python 3.11+
- (Optional, for stages 5–8) KiCad 8.x

```bash
# Install KiCad on Mac
brew install --cask kicad
```

### 2. Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env and set ANTHROPIC_API_KEY (required for stages 1–3)
```

### 4. Run the server

```bash
uvicorn main:app --reload --port 8000
```

Interactive docs: http://localhost:8000/docs

---

## Pipeline Endpoints

| # | Endpoint | Input | Output |
|---|----------|-------|--------|
| 1 | `POST /extract-requirements` | `{ prompt }` | Structured requirements JSON |
| 2 | `POST /generate-architecture` | RequirementsOutput | Block diagram nodes + edges |
| 3 | `POST /select-components` | Architecture + Requirements | BOM component list |
| 4 | `POST /generate-schematic` | Components + Architecture | Netlist file + JSON nets |
| 5 | `POST /generate-pcb` | Netlist path | `.kicad_pcb` file |
| 6 | `POST /place-and-route` | PCB path | Placed + routed PCB |
| 7 | `POST /verify` | PCB path | ERC/DRC/heuristic checks |
| 8 | `POST /export` | PCB + components | Gerbers + BOM + STEP + report ZIP |
| 9 | `POST /apply-edit` | Design state + command | Updated state + re-verify |
| ★ | `POST /run-pipeline` | `{ prompt }` | Full pipeline in one call |

---

## Stage-by-Stage Testing (LED Blinker)

Test prompt: `"Design a simple LED blinker PCB using ESP32, with one LED connected to a GPIO pin through a current-limiting resistor, powered via USB-C with a 3.3V regulator."`

```bash
BASE=http://localhost:8000

# Stage 1 — Requirements
curl -s -X POST $BASE/extract-requirements \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Design a simple LED blinker PCB using ESP32, with one LED connected to a GPIO pin through a current-limiting resistor, powered via USB-C with a 3.3V regulator."}' \
  | tee stage1.json | python3 -m json.tool

# Stage 2 — Architecture (pipe stage1 output)
curl -s -X POST $BASE/generate-architecture \
  -H "Content-Type: application/json" \
  -d @stage1.json | tee stage2.json | python3 -m json.tool

# Stage 3 — Components
cat > stage3_input.json <<EOF
{"architecture": $(cat stage2.json), "requirements": $(cat stage1.json)}
EOF
curl -s -X POST $BASE/select-components \
  -H "Content-Type: application/json" \
  -d @stage3_input.json | tee stage3.json | python3 -m json.tool

# Stage 4 — Schematic/Netlist
cat > stage4_input.json <<EOF
{"components": $(cat stage3.json), "architecture": $(cat stage2.json)}
EOF
curl -s -X POST $BASE/generate-schematic \
  -H "Content-Type: application/json" \
  -d @stage4_input.json | tee stage4.json | python3 -m json.tool

# Stage 5 — PCB (requires KiCad)
NETLIST_PATH=$(cat stage4.json | python3 -c "import sys,json; print(json.load(sys.stdin)['netlist_path'])")
curl -s -X POST $BASE/generate-pcb \
  -H "Content-Type: application/json" \
  -d "{\"netlist_path\":\"$NETLIST_PATH\",\"board_constraints\":{\"max_width_mm\":60,\"max_height_mm\":45,\"layers\":2,\"min_trace_mm\":0.2,\"min_clearance_mm\":0.2}}" \
  | tee stage5.json | python3 -m json.tool

# Stage 6 — Place & Route
PCB_PATH=$(cat stage5.json | python3 -c "import sys,json; print(json.load(sys.stdin)['pcb_path'])")
curl -s -X POST $BASE/place-and-route \
  -H "Content-Type: application/json" \
  -d "{\"pcb_path\":\"$PCB_PATH\",\"board_constraints\":{\"max_width_mm\":60,\"max_height_mm\":45,\"layers\":2,\"min_trace_mm\":0.2,\"min_clearance_mm\":0.2}}" \
  | tee stage6.json | python3 -m json.tool

# Stage 7 — Verify (DRC must PASS with 0 violations)
curl -s -X POST $BASE/verify \
  -H "Content-Type: application/json" \
  -d "{\"pcb_path\":\"$PCB_PATH\",\"netlist_path\":\"$NETLIST_PATH\"}" \
  | tee stage7.json | python3 -m json.tool

# Stage 8 — Export
curl -s -X POST $BASE/export \
  -H "Content-Type: application/json" \
  -d "{\"pcb_path\":\"$PCB_PATH\",\"netlist_path\":\"$NETLIST_PATH\"}" \
  | tee stage8.json | python3 -m json.tool

# Full pipeline (convenience)
curl -s -X POST $BASE/run-pipeline \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Design a simple LED blinker PCB using ESP32, with one LED connected to a GPIO pin through a current-limiting resistor, powered via USB-C with a 3.3V regulator."}' \
  | python3 -m json.tool
```

---

## KiCad CLI — Installation & Verification

```bash
# Install
brew install --cask kicad

# Verify kicad-cli is accessible
kicad-cli --version
# Expected: kicad-cli 8.x.x

# Find kicad-cli path (add to .env KICAD_CLI_PATH)
which kicad-cli
# or:
ls /Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli

# Find pcbnew Python path (add to .env KICAD_SCRIPTING_PATH)
/Applications/KiCad/KiCad.app/Contents/Frameworks/Python.framework/Versions/Current/bin/python3 \
  -c "import pcbnew; print(pcbnew.__file__)"
```

> **Note**: Stages 1–4 (LLM + SKiDL) work without KiCad. Stages 5–8 degrade gracefully with a fallback skeleton PCB when `kicad-cli` is not in PATH.

---

## Supabase Setup

```bash
# Apply migrations (requires Supabase CLI)
supabase link --project-ref behbsukelneeihajalfh
supabase db push --include-all

# Or apply directly with psql
psql "postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres" \
  -f supabase/migrations/001_create_tables.sql
```

Get the service role key from: Supabase Dashboard → Settings → API → `service_role` key.

---

## Test Circuits Progression

| Circuit | Complexity | Success Criteria |
|---------|-----------|------------------|
| LED Blinker | ⬛ Simple | Valid netlist, ERC PASS, 2-layer board, DRC 0 violations, Gerbers exported |
| DHT22 Sensor | ⬛⬛ Medium | + sensor pull-up verified in ERC, I²C net present |
| Irrigation Controller | ⬛⬛⬛ Complex | + relay driver, soil sensor ADC, WiFi MCU, 23 parts, 41 nets |

---

## Response Contract — Frontend Compatibility

All endpoints return shapes that match the FlowCAD frontend mock data:

| Frontend type | Backend response field |
|---------------|----------------------|
| `Check[]` | `VerificationOutput.checks` — same `{name, status, score, note}` |
| `Net[]` | `SchematicOutput.nets` — same `{from_ref, to_ref, net}` |
| `Part[]` | `SchematicOutput.parts` — same fields as design-store `Part` |
| `bomLines()` | `ComponentsOutput.components` — same `{ref, name, qty, pkg, unit, total}` |
| `exportArtifacts` | `ExportOutput.artifacts` — same `{name, file, size, fmt}` |
