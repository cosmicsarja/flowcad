import os
import glob
import re
import json
import logging
from pathlib import Path
from typing import Dict, List, Any, Optional

logger = logging.getLogger(__name__)

# Hardcoded for Mac default install. In production, this would be an env var.
KICAD_SYM_DIR = os.environ.get("KICAD_SYMBOL_LIBS", "/Applications/KiCad/KiCad.app/Contents/SharedSupport/symbols")
INDEX_FILE = Path(__file__).parent.parent / "component_library" / "kicad_index.json"
CURATED_LIB_FILE = Path(__file__).parent.parent / "component_library" / "components.json"

class KiCadLibrary:
    def __init__(self):
        self.parts: List[Dict[str, Any]] = []
        self._load_curated_library()   # Always load curated lib first
        self._load_or_build_index()    # Then augment with KiCad symbols if available

    def _load_curated_library(self):
        """Load the curated components.json library — always available, no KiCad needed."""
        if not CURATED_LIB_FILE.exists():
            logger.warning("Curated library not found at %s", CURATED_LIB_FILE)
            return
        try:
            curated = json.loads(CURATED_LIB_FILE.read_text())
            for comp in curated:
                # Normalise to internal format
                tags = comp.get("tags", [])
                self.parts.append({
                    "id": comp["id"],
                    "name": comp["name"],
                    "lib": comp.get("skidl_lib", "Device"),
                    "footprint": comp.get("kicad_footprint", comp.get("footprint", "")),
                    "description": comp.get("description", ""),
                    "keywords": " ".join(tags),
                    "datasheet": comp.get("datasheet_url", ""),
                    "category": comp.get("category", "passive"),
                    "package": comp.get("package", ""),
                    "unit_cost": comp.get("unit_cost", 0.10),
                    "specs": comp.get("specs", []),
                    "extends": None,
                    "_source": "curated",
                })
            logger.info("Loaded %d parts from curated library", len(curated))
        except Exception as exc:
            logger.warning("Failed to load curated library: %s", exc)

    def _load_or_build_index(self):
        if INDEX_FILE.exists():
            try:
                kicad_parts = json.loads(INDEX_FILE.read_text())
                self.parts.extend(kicad_parts)  # extend, not replace
                logger.info(f"Loaded {len(kicad_parts)} parts from KiCad index cache.")
                return
            except Exception as e:
                logger.warning(f"Failed to load cache, rebuilding... ({e})")
        
        kicad_parts = self._build_index()
        self.parts.extend(kicad_parts)  # extend, not replace
        try:
            INDEX_FILE.parent.mkdir(parents=True, exist_ok=True)
            INDEX_FILE.write_text(json.dumps(kicad_parts, indent=2))
            logger.info(f"Saved KiCad index cache to {INDEX_FILE}")
        except Exception as e:
            logger.warning(f"Failed to save KiCad index cache: {e}")

    def _build_index(self) -> List[Dict[str, Any]]:
        logger.info(f"Scanning KiCad symbols in {KICAD_SYM_DIR}...")
        parts = []
        
        if not os.path.exists(KICAD_SYM_DIR):
            logger.error(f"KiCad symbols dir not found: {KICAD_SYM_DIR}")
            return parts

        # Regexes for parsing S-expressions
        # Match main symbols only, ignore unit symbols ending in _0_1 etc.
        re_symbol = re.compile(r'^\s*\(symbol\s+"([^"]+)"')
        re_extends = re.compile(r'^\s*\(extends\s+"([^"]+)"\)')
        re_property = re.compile(r'^\s*\(property\s+"([^"]+)"\s+"([^"]*)"')

        for sym_file in glob.glob(os.path.join(KICAD_SYM_DIR, "*.kicad_sym")):
            lib_name = os.path.basename(sym_file).replace('.kicad_sym', '')
            
            with open(sym_file, 'r', encoding='utf-8') as f:
                current_part = None
                
                for line in f:
                    # Match start of a symbol
                    sym_match = re_symbol.match(line)
                    if sym_match:
                        name = sym_match.group(1)
                        # Skip sub-units like "ESP32-WROOM-32_0_1"
                        if re.search(r'_\d+_\d+$', name):
                            continue
                            
                        if current_part:
                            self._finalize_part(current_part)
                            parts.append(current_part)
                            
                        current_part = {
                            "id": f"{lib_name}:{name}".lower(),
                            "name": name,
                            "lib": lib_name,
                            "footprint": "",
                            "description": "",
                            "keywords": "",
                            "datasheet": "",
                            "extends": None,
                        }
                        continue
                        
                    if current_part is None:
                        continue
                        
                    # Match properties
                    prop_match = re_property.match(line)
                    if prop_match:
                        key, val = prop_match.groups()
                        if key == "Footprint":
                            current_part["footprint"] = val
                        elif key == "ki_description":
                            current_part["description"] = val
                        elif key == "ki_keywords":
                            current_part["keywords"] = val
                        elif key == "Datasheet":
                            current_part["datasheet"] = val
                        continue
                        
                    # Match extends (inheritance)
                    ext_match = re_extends.match(line)
                    if ext_match:
                        current_part["extends"] = ext_match.group(1)

                if current_part:
                    self._finalize_part(current_part)
                    parts.append(current_part)

        # Resolve inheritance for footprints
        part_dict = {p["id"]: p for p in parts}
        for p in parts:
            if p["extends"]:
                parent_id = f"{p['lib']}:{p['extends']}".lower()
                parent = part_dict.get(parent_id)
                if parent:
                    if not p["footprint"] and parent["footprint"]:
                        p["footprint"] = parent["footprint"]
                    if not p["description"] and parent["description"]:
                        p["description"] = parent["description"]

        logger.info(f"Indexed {len(parts)} main symbols.")
        return parts

    def _finalize_part(self, part: dict):
        """Assign category based on library and keywords."""
        text = f"{part['lib']} {part['name']} {part['keywords']} {part['description']}".lower()
        
        # Heuristic categorization
        if "mcu" in text or "microcontroller" in text or "esp32" in text or "atmega" in text:
            cat = "mcu"
        elif "sensor" in text or "temperature" in text or "humidity" in text or "adc" in text:
            cat = "sensor"
        elif "regulator" in text or "ldo" in text or "battery" in text or "power" in text:
            cat = "power"
        elif "relay" in text or "motor" in text or "pump" in text or "driver" in text or "actuator" in text:
            cat = "actuator"
        elif "connector" in text or "usb" in text or "header" in text or "terminal" in text or "switch" in text:
            cat = "io"
        elif "resistor" in text or "capacitor" in text or "inductor" in text or "diode" in text or "device" in text:
            cat = "passive"
        else:
            cat = "io"
            
        part["category"] = cat

    def search_components(self, keywords: str, category: str = None, limit: int = 5) -> List[Dict[str, Any]]:
        query = keywords.lower().split()
        results = []
        
        for part in self.parts:
            # Curated parts are always searched regardless of category filter
            # (they have accurate categories already)
            if category and part.get("category") != category:
                if part.get("_source") != "curated":
                    continue
                # Still include curated parts from other categories at half score
                # so they appear as alternatives
                
            text = f"{part['name']} {part.get('keywords','')} {part.get('description','')}".lower()
            
            # Count matches — curated parts get a small bonus
            score = 0
            for q in query:
                if q in text:
                    score += 1
            if part.get("_source") == "curated" and score > 0:
                score += 0.5  # prefer curated over generic KiCad symbols
                    
            if score > 0:
                results.append((score, part))
                
        # Sort by score descending, then by name length ascending (prefer shorter exact matches)
        results.sort(key=lambda x: (-x[0], len(x[1]["name"])))
        
        return [r[1] for r in results[:limit]]

# Singleton instance
_library = None

def get_library() -> KiCadLibrary:
    global _library
    if _library is None:
        _library = KiCadLibrary()
    return _library
