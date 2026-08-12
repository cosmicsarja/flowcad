"""
schemas/requirements.py
────────────────────────
Backward-compatibility shim.
All models have moved to models/pipeline.py.
Re-exports every symbol from models.pipeline so that imports from either
schemas.requirements or models (or models.pipeline) share exact Python class identities.
"""
from models.pipeline import *
