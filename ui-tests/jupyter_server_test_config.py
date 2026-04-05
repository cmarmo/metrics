"""Server configuration for integration tests.

!! Never use this configuration in production because it
opens the server to the world and provide access to JupyterLab
JavaScript objects through the global window variable.
"""
import sys
from os import environ
from pathlib import Path

from jupyterlab.galata import configure_jupyter_server

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))

configure_jupyter_server(c)

c.ServerApp.answer_yes = True

environ["NOTEBOOK_METRICS_OVERRIDE"] = str(
    ROOT / "metrics-override.yml"
)

try:
    c.ServerApp.jpserver_extensions.update(
        {
            "event_capture_extension": True,
            "notebook_metrics": True,
        }
    )
except AttributeError:
    c.ServerApp.jpserver_extensions = {
        "event_capture_extension": True,
        "notebook_metrics": True,
    }

# Uncomment to set server log level to debug level
# c.ServerApp.log_level = "DEBUG"
