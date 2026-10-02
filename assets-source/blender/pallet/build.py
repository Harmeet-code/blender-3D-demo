import runpy, sys
from pathlib import Path
sys.argv = [sys.argv[0], "--", "--asset", "pallet", "--variant", "all"]
runpy.run_path(str(Path(__file__).resolve().parents[1] / "build.py"), run_name="__main__")
