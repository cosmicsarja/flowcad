# FlowCAD: AI PCB Design

Build a web app called "FlowCAD" — an AI-powered Prompt-to-PCB design platform.

It should look and feel like a professional EDA / CAD tool (similar to Figma or 

Linear in polish, but with the technical density of KiCad or Altium) — dark theme, 

precise, engineering-grade, not a generic SaaS landing page.

## Overall Concept

FlowCAD lets a user describe an electronic system in natural language, and the 

platform (conceptually) walks that request through: requirement extraction → 

architecture → component selection → schematic → PCB placement → routing → 

verification → 3D preview → manufacturing export (Gerber/BOM). Build the FULL 

frontend/UI for this workflow. Use realistic mock/sample data throughout — no 

real backend or AI calls needed yet.

## Pages / Screens

### 1. Landing Page

- Hero section: "Describe it. FlowCAD designs it." with a large prompt input box 

  front and center (like a search bar), placeholder: "Design an ESP32-based smart 

  irrigation controller with soil moisture sensor and relay..."

- Below: 3-4 feature highlights with icons — Conversational Design, Verification-Aware 

  AI, Multi-Agent Pipeline, Manufacturing-Ready Output

- A horizontal pipeline diagram graphic: Prompt → Architecture → Schematic → PCB → 

  Verification → 3D → Export

- Dark navy/charcoal background, electric blue or teal accent color, monospace 

  accents for technical labels

### 2. Workspace (main app, after submitting a prompt)

Multi-panel CAD-style layout:

**Left sidebar** — Pipeline stepper (vertical), showing stages as a progress tracker:

Requirement Extraction → Architecture → Components → Schematic → Placement → 

Routing → Verification → 3D View → Export. Each stage clickable, shows a status 

icon (done/active/pending).

**Center panel** — Main canvas, tabbed:

- Tab "Block Diagram": simple node-graph view (boxes + connecting lines) showing 

  system architecture, e.g. Power Supply → ESP32 → [Soil Sensor, Temp Sensor, Relay → Pump]

- Tab "Schematic": mock schematic view with component symbols and net lines

- Tab "PCB Layout": top-down PCB view with placed components, silkscreen labels, 

  trace lines, board outline

- Tab "3D View": placeholder 3D PCB render (can be a static illustrative mock, 

  rotate controls UI even if non-functional)

**Right sidebar** — Context panel, tabbed:

- "Details": selected component's specs, datasheet link, reasoning ("Selected 

  because ESP32 requires 3.3V supply...")

- "Verification": checklist with progress bars — Electrical, Power, Connectivity, 

  ERC, DRC, Manufacturing — each PASS/WARNING/FAIL with colored bars, overall 

  confidence score

- "BOM": table of components — name, qty, package, unit cost, total cost

- "Alternatives": comparison cards for Design A/B/C (cheapest / low-power / 

  smallest) with a "select this design" button

**Bottom panel** — Conversational editor chat bar, fixed at bottom of workspace:

- Chat-style input: "Make the board 20% smaller" / "Replace DHT11 with DHT22" / 

  "Move USB-C to the left edge"

- Shows a scrollable history of past commands and the system's mock responses 

  ("✅ Board resized. Re-running verification...")

### 3. Export Screen

- Summary cards: Schematic, PCB Layout, Netlist, Gerber Files, Drill Files, BOM, 

  3D Model, Design Report — each with a download icon (non-functional is fine)

- A final "Design Confidence: 94%" summary banner with breakdown bars

## Design System

- Dark theme base (#0B0F14 or similar), panel surfaces slightly lighter with subtle 

  borders (#1A1F26), accent color electric blue/teal (#3DD6D0 or #4C8DFF)

- Monospace font (e.g. JetBrains Mono or IBM Plex Mono) for technical labels, 

  component names, values

- Clean sans-serif (Inter or similar) for UI chrome and body text

- Subtle grid-paper texture in canvas backgrounds to reinforce "CAD tool" feel

- Micro-interactions: hover states on components, smooth panel transitions, 

  status badges with color coding (green=pass, amber=warning, red=fail, 

  blue=in-progress)

## Technical Notes

- Use React + Tailwind CSS

- Use realistic sample data (ESP32 irrigation controller example) pre-populated 

  in the workspace so it looks alive on first load, not empty

- Make layout responsive but optimize primarily for desktop/laptop widths, since 

  this is a CAD tool

- Keep all interactivity client-side/mock — I'll wire up real logic separately

Name the app "FlowCAD" throughout — in the header logo, page titles, and metadata.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a3594df8-5b2b-4b8b-af0a-37a246f7dada).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
