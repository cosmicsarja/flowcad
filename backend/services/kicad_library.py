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

class KiCadLibrary:
    def __init__(self):
        self.parts: List[Dict[str, Any]] = []
        self._load_or_build_index()

    def _load_or_build_index(self):
        if INDEX_FILE.exists():
            try:
                self.parts = json.loads(INDEX_FILE.read_text())
                logger.info(f"Loaded {len(self.parts)} parts from KiCad index cache.")
                return
            except Exception as e:
                logger.warning(f"Failed to load cache, rebuilding... ({e})")
        
        self.parts = self._build_index()
        try:
            INDEX_FILE.parent.mkdir(parents=True, exist_ok=True)
            INDEX_FILE.write_text(json.dumps(self.parts, indent=2))
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
            if category and part["category"] != category:
                continue
                
            text = f"{part['name']} {part['keywords']} {part['description']}".lower()
            
            # Count matches
            score = 0
            for q in query:
                if q in text:
                    score += 1
                    
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
