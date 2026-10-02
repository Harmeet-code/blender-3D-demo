import runpy, sys
from pathlib import Path
sys.argv = [sys.argv[0], "--", "--asset", "forklift", "--variant", "low"]
runpy.run_path(str(Path(__file__).resolve().parents[1] / "build.py"), run_name="__main__")
