import pathlib
import warnings

js_package = "@notebook-link/metrics"
py_package = "notebook_link_metrics"
schemas = [
    "command-executed",
    "current-changed",
    "jupyter-error",
    "runtime-error"
]

# Fallback when using the package in dev mode without installing in editable
# mode with pip. It is highly recommended to install the package from a stable
# release or in editable mode:
# https://pip.pypa.io/en/stable/topics/local-project-installs/#editable-installs
try:
    from ._version import __version__
except ImportError:
    warnings.warn(f"Importing '{py_package}' outside a proper installation.")
    __version__ = "dev"

def _jupyter_labextension_paths():
    return [{ "src": "labextension", "dest": js_package }]

def _jupyter_server_extension_points():
    return [{ "module": py_package }]

def _load_jupyter_server_extension(app):
    app.log.info(f"{py_package} {__version__} registering event schemas")
    event_logger = app.event_logger
    root = pathlib.Path(__file__).parent
    for schema in schemas:
        event_logger.register_event_schema(root / "emissions" / f"{schema}.yml")
