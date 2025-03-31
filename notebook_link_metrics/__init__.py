import pathlib

try:
    from ._version import __version__
except ImportError:
    # Fallback when using the package in dev mode without installing
    # in editable mode with pip. It is highly recommended to install
    # the package from a stable release or in editable mode: https://pip.pypa.io/en/stable/topics/local-project-installs/#editable-installs
    import warnings
    warnings.warn("Importing 'notebook_link_metrics' outside a proper installation.")
    __version__ = "dev"


def _jupyter_labextension_paths():
    return [{
        "src": "labextension",
        "dest": "@notebook-link/metrics"
    }]


def _jupyter_server_extension_points():
    return [{
        "module": "notebook_link_metrics"
    }]


def _load_jupyter_server_extension(app):
    name = "notebook_link_metrics"
    parent = pathlib.Path(__file__).parent
    app.event_logger.register_event_schema(parent / "emissions" / "command-executed.yml")
    app.event_logger.register_event_schema(parent / "emissions" / "current-changed.yml")
    app.event_logger.register_event_schema(parent / "emissions" / "jupyter-error.yml")
    app.event_logger.register_event_schema(parent / "emissions" / "runtime-error.yml")
    app.log.info(f"Registered {name} server extension")
