"""
services/requirement_extractor.py
──────────────────────────────────
Stage 1 — pure function: prompt → RequirementsOutput
Robust to LLM returning flat/partial JSON — auto-repairs and retries.
"""
from __future__ import annotations

import logging
from typing import Any

from models.pipeline import RequirementsOutput, PowerConstraints, BoardConstraints
from services.llm_client import call_llm

logger = logging.getLogger(__name__)

# Minimal, crystal-clear system prompt with a concrete example
SYSTEM_PROMPT = """\
You are an expert PCB design engineer.
Return ONLY a single valid JSON object — no markdown, no explanation, no extra text.

REQUIRED OUTPUT FORMAT (copy this structure exactly):
{
  "microcontroller": "STM32F103C8T6",
  "sensors": ["temperature sensor", "current sensor"],
  "actuators": ["relay", "LED indicator"],
  "interfaces": ["USB", "I2C", "UART"],
  "power_constraints": {
    "input_voltage": "220V AC",
    "output_voltage": "12V DC",
    "max_current_ma": 2000,
    "battery_operated": false
  },
  "board_constraints": {
    "max_width_mm": 60.0,
    "max_height_mm": 45.0,
    "layers": 2,
    "min_trace_mm": 0.2,
    "min_clearance_mm": 0.2
  },
  "requirements": [
    "Convert AC mains to regulated DC output",
    "Include isolation transformer",
    "Over-voltage and short-circuit protection"
  ]
}

RULES:
- microcontroller: use "" if no MCU is needed (e.g. simple power supply)
- sensors/actuators/interfaces: use [] if none applicable
- power_constraints and board_constraints are REQUIRED nested objects
- Default board size: 60×45 mm, 2 layers if not specified
- requirements: 5-10 concise bullet points
"""


def _safe_defaults() -> dict:
    """Return a safe default requirements dict."""
    return {
        "microcontroller": "",
        "sensors": [],
        "actuators": [],
        "interfaces": [],
        "power_constraints": {
            "input_voltage": "5V",
            "output_voltage": "3.3V",
            "max_current_ma": 500,
            "battery_operated": False,
        },
        "board_constraints": {
            "max_width_mm": 60.0,
            "max_height_mm": 45.0,
            "layers": 2,
            "min_trace_mm": 0.2,
            "min_clearance_mm": 0.2,
        },
        "requirements": ["Design circuit as described"],
    }


def _repair_flat(raw: dict) -> dict:
    """
    If the LLM returned a flat structure (e.g. input_voltage at root level),
    move fields into the correct nested location.
    """
    repaired = dict(raw)

    # If power_constraints fields leaked to the top level
    power_fields = {"input_voltage", "output_voltage", "max_current_ma", "battery_operated"}
    if not isinstance(repaired.get("power_constraints"), dict):
        pc = {}
        for f in power_fields:
            if f in repaired:
                pc[f] = repaired.pop(f)
        if pc:
            repaired["power_constraints"] = pc

    # If board_constraints fields leaked to the top level
    board_fields = {"max_width_mm", "max_height_mm", "layers", "min_trace_mm", "min_clearance_mm"}
    if not isinstance(repaired.get("board_constraints"), dict):
        bc = {}
        for f in board_fields:
            if f in repaired:
                bc[f] = repaired.pop(f)
        if bc:
            repaired["board_constraints"] = bc

    # Fill in missing top-level fields with defaults
    defaults = _safe_defaults()
    for k, v in defaults.items():
        if k not in repaired or repaired[k] is None:
            repaired[k] = v

    # Merge missing sub-fields into power_constraints
    if isinstance(repaired.get("power_constraints"), dict):
        for k, v in defaults["power_constraints"].items():
            repaired["power_constraints"].setdefault(k, v)

    # Merge missing sub-fields into board_constraints
    if isinstance(repaired.get("board_constraints"), dict):
        for k, v in defaults["board_constraints"].items():
            repaired["board_constraints"].setdefault(k, v)

    return repaired


def extract_requirements(prompt: str, project_id: str | None = None) -> RequirementsOutput:
    """
    Call LLM and validate the response against RequirementsOutput.
    Auto-repairs flat JSON and retries on Pydantic validation failure.
    """
    logger.info("=== REQUIREMENTS EXTRACTION | prompt: %s", prompt)

    last_error: Exception | None = None
    for attempt in range(1, 4):
        try:
            raw: dict[str, Any] = call_llm(
                system_prompt=SYSTEM_PROMPT,
                user_prompt=(
                    f"Circuit description: {prompt}\n\n"
                    "Return ONLY the JSON object following the exact format above."
                ),
                max_tokens=1024,
            )

            # Auto-repair flat / partial JSON
            raw = _repair_flat(raw)

            # Coerce nested dicts so Pydantic can validate
            if isinstance(raw.get("power_constraints"), dict):
                raw["power_constraints"] = PowerConstraints(**raw["power_constraints"])
            if isinstance(raw.get("board_constraints"), dict):
                raw["board_constraints"] = BoardConstraints(**raw["board_constraints"])

            result = RequirementsOutput(**raw, raw_prompt=prompt)
            if project_id:
                result.project_id = project_id

            logger.info(
                "Requirements OK — MCU=%s, sensors=%d, requirements=%d",
                result.microcontroller, len(result.sensors), len(result.requirements),
            )
            return result

        except Exception as exc:
            last_error = exc
            logger.warning("Attempt %d/3 — requirements failed: %s", attempt, exc)

    # All retries failed — return safe defaults so pipeline continues
    logger.error("Requirements extraction failed after 3 attempts — using defaults. Error: %s", last_error)
    defaults = _safe_defaults()
    defaults["requirements"] = [f"Design circuit: {prompt}"]
    result = RequirementsOutput(
        **defaults,
        raw_prompt=prompt,
    )
    if project_id:
        result.project_id = project_id
    return result
