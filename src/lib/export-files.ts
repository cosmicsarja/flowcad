import JSZip from "jszip";
import { bomLines, bomTotalNow, fmtINR, USD_TO_INR, getDesign, type DesignState } from "./design-store";

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const stamp = () => new Date().toISOString().replace("T", " ").slice(0, 19);

function gerberLayer(s: DesignState, layer: string) {
  const head = [
    "G04 FlowCAD generated Gerber X2*",
    `G04 #@! TF.GenerationSoftware,FlowCAD,PromptToPCB,1.0*`,
    `G04 #@! TF.CreationDate,${new Date().toISOString()}*`,
    `G04 #@! TF.FileFunction,${layer}*`,
    "%MOMM*%",
    "%FSLAX46Y46*%",
    "%ADD10C,0.200000*%",
    "D10*",
  ];
  const body = s.parts.flatMap((p) => {
    const x = ((p.px / 9) * 1e6).toFixed(0);
    const y = ((p.py / 9) * 1e6).toFixed(0);
    const x2 = (((p.px + p.pw) / 9) * 1e6).toFixed(0);
    const y2 = (((p.py + p.ph) / 9) * 1e6).toFixed(0);
    return [
      `G04 ${p.ref} ${p.name}*`,
      `X${x}Y${y}D02*`,
      `X${x2}Y${y}D01*`,
      `X${x2}Y${y2}D01*`,
      `X${x}Y${y2}D01*`,
      `X${x}Y${y}D01*`,
    ];
  });
  return [...head, ...body, "M02*"].join("\n");
}

function drillFile(s: DesignState) {
  const holes = s.parts.map(
    (p, i) =>
      `X${((p.px / 9) * 1000).toFixed(0)}Y${((p.py / 9) * 1000).toFixed(0)} ; ${p.ref} pad ${i + 1}`,
  );
  return [
    "M48",
    `; FlowCAD drill file — ${stamp()}`,
    "METRIC,TZ",
    "T1C0.300",
    "T2C0.800",
    "%",
    "G90",
    "T1",
    ...holes,
    "T0",
    "M30",
  ].join("\n");
}

function netlistFile(s: DesignState) {
  const byNet = new Map<string, string[]>();
  s.nets.forEach((n) => {
    const arr = byNet.get(n.net) ?? [];
    arr.push(n.from, n.to);
    byNet.set(n.net, [...new Set(arr)]);
  });
  return [
    `(export (version FlowCAD-1.0)`,
    `  ; project IRRIGATION_CTRL rev B — generated ${stamp()}`,
    `  ; board ${s.board.w} x ${s.board.h} mm`,
    "  (components",
    ...s.parts.map(
      (p) =>
        `    (comp (ref ${p.ref}) (value "${p.name}") (footprint ${p.pkg.replace(/\s/g, "_")}))`,
    ),
    "  )",
    "  (nets",
    ...[...byNet.entries()].map(
      ([net, refs], i) =>
        `    (net (code ${i + 1}) (name "${net}") ${refs.map((r) => `(node (ref ${r}))`).join(" ")})`,
    ),
    "  )",
    ")",
  ].join("\n");
}

function bomCsv(s: DesignState) {
  const toINR = (usd: number) => (usd * USD_TO_INR).toFixed(2);
  const rows = [
    ["Ref", "Name", "Qty", "Package", "Unit Cost (INR)", "Total (INR)"],
    ...bomLines(s).map((l) => [
      l.ref,
      l.name,
      String(l.qty),
      l.pkg,
      toINR(l.unit),
      toINR(l.total),
    ]),
    ["", "BOARD TOTAL", "", "", "", toINR(bomTotalNow(s))],
  ];
  return rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
}

function reportHtml(s: DesignState) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>FlowCAD Design Report — IRRIGATION_CTRL</title>
<style>
body{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#0b0f14;color:#dfe7ee;margin:0;padding:40px}
h1{color:#4fd1c5;font-size:22px;margin:0 0 4px}h2{font-size:14px;color:#4fd1c5;margin:28px 0 8px;text-transform:uppercase;letter-spacing:.12em}
table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #22303c;padding:6px 8px;text-align:left}
th{background:#121a22;color:#8aa0b0;font-weight:500}.pass{color:#4ade80}.warn{color:#fbbf24}.fail{color:#f87171}
.meta{color:#8aa0b0;font-size:12px}@media print{body{background:#fff;color:#111}}
</style></head><body>
<h1>FlowCAD Design Report</h1>
<p class="meta">IRRIGATION_CTRL · rev B · generated ${stamp()}</p>
<h2>Board</h2>
<table><tr><th>Dimensions</th><td>${s.board.w.toFixed(2)} × ${s.board.h.toFixed(2)} mm</td></tr>
<tr><th>Stackup</th><td>2-layer FR-4, 1.6 mm, 1 oz copper</td></tr>
<tr><th>Components</th><td>${s.parts.length}</td></tr>
<tr><th>Nets</th><td>${s.nets.length}</td></tr>
<tr><th>BOM total</th><td>${fmtINR(bomTotalNow(s))} / board</td></tr>
<tr><th>Design confidence</th><td>${s.confidence}%</td></tr></table>
<h2>Components</h2>
<table><tr><th>Ref</th><th>Name</th><th>Package</th><th>Qty</th><th>Position (mm)</th><th>Total</th></tr>
${s.parts.map((p) => `<tr><td>${p.ref}</td><td>${p.name}</td><td>${p.pkg}</td><td>${p.qty}</td><td>${(p.px / 9).toFixed(2)}, ${(p.py / 9).toFixed(2)}</td><td>${fmtINR(p.unit * p.qty)}</td></tr>`).join("")}
</table>
<h2>Verification</h2>
<table><tr><th>Check</th><th>Status</th><th>Score</th><th>Note</th></tr>
${s.checks.map((c) => `<tr><td>${c.name}</td><td class="${c.status.toLowerCase()}">${c.status}</td><td>${c.score}</td><td>${c.note}</td></tr>`).join("")}
</table>
<h2>Netlist</h2>
<table><tr><th>Net</th><th>Nodes</th></tr>
${s.nets.map((n) => `<tr><td>${n.net}</td><td>${n.from} → ${n.to}</td></tr>`).join("")}
</table>
</body></html>`;
}

export const artifactFiles: Record<string, string> = {
  Schematic: "flowcad_irrigation_sch.svg",
  "PCB Layout": "flowcad_irrigation.kicad_pcb",
  Netlist: "flowcad_irrigation.net",
  "Gerber Files": "gerber_x2_bundle.zip",
  "Drill Files": "drill_pth_npth.zip",
  "Bill of Materials": "bom_flowcad.csv",
  "3D Model": "flowcad_irrigation.step",
  "Design Report": "flowcad_design_report.html",
};

export async function generateArtifact(name: string) {
  const s = getDesign();
  switch (name) {
    case "Gerber Files": {
      const zip = new JSZip();
      [
        ["flowcad-F_Cu.gbr", "Copper,L1,Top"],
        ["flowcad-B_Cu.gbr", "Copper,L2,Bot"],
        ["flowcad-F_Mask.gbr", "Soldermask,Top"],
        ["flowcad-F_Silkscreen.gbr", "Legend,Top"],
        ["flowcad-Edge_Cuts.gbr", "Profile,NP"],
      ].forEach(([f, fn]) => zip.file(f!, gerberLayer(s, fn!)));
      zip.file(
        "README.txt",
        `FlowCAD Gerber X2 bundle\nBoard ${s.board.w} x ${s.board.h} mm\nGenerated ${stamp()}\n`,
      );
      download(await zip.generateAsync({ type: "blob" }), "gerber_x2_bundle.zip");
      return;
    }
    case "Drill Files": {
      const zip = new JSZip();
      zip.file("flowcad-PTH.drl", drillFile(s));
      zip.file(
        "flowcad-NPTH.drl",
        `M48\n; non-plated mounting holes\nMETRIC,TZ\nT1C3.200\n%\nG90\nT1\nX2000Y2000\nX${(s.board.w * 1000 - 2000).toFixed(0)}Y2000\nT0\nM30\n`,
      );
      download(await zip.generateAsync({ type: "blob" }), "drill_pth_npth.zip");
      return;
    }
    case "Netlist":
      download(new Blob([netlistFile(s)], { type: "text/plain" }), "flowcad_irrigation.net");
      return;
    case "Bill of Materials":
      download(new Blob([bomCsv(s)], { type: "text/csv" }), "bom_flowcad.csv");
      return;
    case "Design Report":
      download(new Blob([reportHtml(s)], { type: "text/html" }), "flowcad_design_report.html");
      return;
    case "3D Model": {
      const step = [
        "ISO-10303-21;",
        "HEADER;",
        `FILE_DESCRIPTION(('FlowCAD PCB assembly'),'2;1');`,
        `FILE_NAME('flowcad_irrigation.step','${new Date().toISOString()}',('FlowCAD'),(''),'FlowCAD','','');`,
        "FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));",
        "ENDSEC;",
        "DATA;",
        `#1 = PRODUCT('IRRIGATION_CTRL','${s.board.w}x${s.board.h}mm board','',());`,
        ...s.parts.map(
          (p, i) => `#${i + 2} = PRODUCT('${p.ref}','${p.name}','',()); /* z=${p.z} */`,
        ),
        "ENDSEC;",
        "END-ISO-10303-21;",
      ].join("\n");
      download(new Blob([step], { type: "model/step" }), "flowcad_irrigation.step");
      return;
    }
    case "PCB Layout": {
      const kicad = [
        `(kicad_pcb (version 20240101) (generator flowcad)`,
        `  (general (thickness 1.6))`,
        `  (gr_rect (start 0 0) (end ${s.board.w} ${s.board.h}) (layer "Edge.Cuts") (width 0.1))`,
        ...s.parts.map(
          (p) =>
            `  (footprint "${p.pkg.replace(/\s/g, "_")}" (at ${(p.px / 9).toFixed(2)} ${(p.py / 9).toFixed(2)}) (fp_text reference "${p.ref}") (fp_text value "${p.name}"))`,
        ),
        ")",
      ].join("\n");
      download(new Blob([kicad], { type: "text/plain" }), "flowcad_irrigation.kicad_pcb");
      return;
    }
    default: {
      // Schematic — export a simple SVG sheet of the current symbol placement
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 480" width="900" height="480">
<rect width="900" height="480" fill="#0b0f14"/>
${s.nets
  .map((n) => {
    const a = s.parts.find((p) => p.ref === n.from);
    const b = s.parts.find((p) => p.ref === n.to);
    if (!a || !b) return "";
    return `<path d="M${a.sx + 96} ${a.sy + 31} H${(a.sx + b.sx) / 2} V${b.sy + 31} H${b.sx}" stroke="#4fd1c5" fill="none"/>`;
  })
  .join("\n")}
${s.parts
  .map(
    (p) =>
      `<g><rect x="${p.sx}" y="${p.sy}" width="96" height="62" fill="#121a22" stroke="#c9d6e2"/><text x="${p.sx + 48}" y="${p.sy + 30}" fill="#dfe7ee" font-family="monospace" font-size="11" text-anchor="middle">${p.ref}</text><text x="${p.sx + 48}" y="${p.sy + 46}" fill="#8aa0b0" font-family="monospace" font-size="9" text-anchor="middle">${p.value}</text></g>`,
  )
  .join("\n")}
</svg>`;
      download(new Blob([svg], { type: "image/svg+xml" }), "flowcad_irrigation_sch.svg");
    }
  }
}

export async function generateAll() {
  const s = getDesign();
  const zip = new JSZip();
  zip.file("gerbers/flowcad-F_Cu.gbr", gerberLayer(s, "Copper,L1,Top"));
  zip.file("gerbers/flowcad-B_Cu.gbr", gerberLayer(s, "Copper,L2,Bot"));
  zip.file("drill/flowcad-PTH.drl", drillFile(s));
  zip.file("flowcad_irrigation.net", netlistFile(s));
  zip.file("bom_flowcad.csv", bomCsv(s));
  zip.file("flowcad_design_report.html", reportHtml(s));
  download(await zip.generateAsync({ type: "blob" }), "flowcad_irrigation_rev_b_fab.zip");
}
