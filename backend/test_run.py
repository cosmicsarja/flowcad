import asyncio
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from services.requirement_extractor import extract_requirements
from services.architecture_generator import generate_architecture
from services.component_selector import select_components, ComponentsInput
from services.schematic_generator import generate_schematic, SchematicInput
from services.layout_extractor import extract_layout
from models.pipeline import RequirementsOutput, ArchitectureOutput

async def main():
    prompt = "design an AC-DC converter 220V to 12V 2A for TV manufacturing"
    project_id = "test-ac-dc"
    
    print("1. Requirements...")
    reqs = extract_requirements(prompt, project_id)
    print(f"MCU: {reqs.microcontroller}")
    
    print("2. Architecture...")
    arch = generate_architecture(reqs)
    print(f"Nodes: {len(arch.nodes)}")
    
    print("3. Components...")
    inp = ComponentsInput(project_id=project_id, requirements=reqs, architecture=arch)
    comps = select_components(inp)
    print(f"Components: {len(comps.components)}")
    
    print("4. Schematic...")
    sch_inp = SchematicInput(project_id=project_id, requirements=reqs, architecture=arch, components=comps)
    sch = generate_schematic(sch_inp)
    print(f"Nets: {len(sch.nets)}")
    
    print("5. Layout...")
    netlist_data = sch.model_dump()
    comps_data = comps.model_dump()
    layout = extract_layout(
        pcb_path="",
        netlist_data=netlist_data,
        components_data=comps_data,
        board_constraints=reqs.board_constraints.model_dump(),
        project_id=project_id
    )
    print(f"Placed components: {len(layout.placement)}")
    print(f"Routing segments: {len(layout.routing)}")
    for pc in layout.placement:
        print(f"  {pc.ref} ({pc.name}): x={pc.x_mm}, y={pc.y_mm}")

if __name__ == "__main__":
    asyncio.run(main())
