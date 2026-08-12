"""
services/requirement_extractor.py
──────────────────────────────────
Stage 1 — pure function: prompt → RequirementsOutput
No Supabase writes here; the orchestration router owns persistence.
"""
from __future__ import annotations

import logging
from typing import Any

from models.pipeline import RequirementsOutput, PowerConstraints, BoardConstraints
from core.gemini_client import call_gemini

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You are an expert electronics engineer and PCB designer.
Extract hardware design requirements from a natural-language circuit description.
Return ONLY a valid JSON object — no prose, no markdown, no explanation.
The JSON must match this exact schema:

{
  "microcontroller": "<primary MCU name, e.g. ESP32-WROOM-32E>",
  "sensors": ["<sensor 1>", "<sensor 2>"],
  "actuators": ["<actuator 1>"],
  "interfaces": ["<interface: USB, I2C, SPI, UART, WiFi, etc.>"],
  "power_constraints": {
    "input_voltage": "<e.g. 5V USB>",
    "output_voltage": "<e.g. 3.3V>",
    "max_current_ma": <integer mA>,
    "battery_operated": <true|false>
  },
  "board_constraints": {
    "max_width_mm": <float>,
    "max_height_mm": <float>,
    "layers": <2 or 4>,
    "min_trace_mm": <float, typically 0.2>,
    "min_clearance_mm": <float, typically 0.2>
  },
  "requirements": [
    "<plain-English requirement 1>",
    "<plain-English requirement 2>"
  ]
}

Rules:
- If the prompt doesn't specify board size, default to 60×45 mm.
- If power is USB-C/USB-A, set input_voltage to "5V USB".
- If a 3.3V regulator is mentioned or implied by the MCU, set output_voltage to "3.3V".
- "requirements" should be 6–15 concise bullet points derived from the prompt.
- Do not invent components not mentioned or implied by the prompt.
"""


def extract_requirements(prompt: str, project_id: str | None = None) -> RequirementsOutput:
    """
    Call Gemini and validate the response against RequirementsOutput.
    Raises ValueError on validation failure (after retries).
    project_id is optional — set by the orchestration router.
    """
    logger.info("================ GEMINI API CALL (REQUIREMENTS) ================")
    logger.info("Prompt: %s", prompt)
    logger.info("Calling model via core.gemini_client.call_gemini...")
    raw: dict[str, Any] = call_gemini(
        system=SYSTEM_PROMPT,
        user=f"Circuit description:\n{prompt}",
        max_tokens=2048,
    )

    # Coerce nested dicts so Pydantic can validate them
    if isinstance(raw.get("power_constraints"), dict):
        raw["power_constraints"] = PowerConstraints(**raw["power_constraints"])
    if isinstance(raw.get("board_constraints"), dict):
        raw["board_constraints"] = BoardConstraints(**raw["board_constraints"])

    result = RequirementsOutput(**raw, raw_prompt=prompt)
    if project_id:
        result.project_id = project_id

    logger.info("================ GEMINI API RESPONSE ================")
    logger.info("Successfully parsed requirements into structured RequirementsOutput.")
    logger.info("Requirements count: %d", len(result.requirements))
    logger.info(
        "Power: %s, Board: w=%.1f, h=%.1f, layers=%d",
        result.power_constraints,
        result.board_constraints.max_width_mm,
        result.board_constraints.max_height_mm,
        result.board_constraints.layers,
    )
    logger.info(
        "Requirements extracted: MCU=%s, sensors=%s, actuators=%s",
        result.microcontroller, result.sensors, result.actuators,
    )
    return result
