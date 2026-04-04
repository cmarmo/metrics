import json

from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join
from notebook_link_metrics import schemas
from tornado import web


class MetricsCaptureHandler(APIHandler):
    @property
    def capture(self):
        return self.settings["notebook_link_metrics_capture"]

    @web.authenticated
    def delete(self):
        self.capture.clear()
        self.set_header("Content-Type", "application/json")
        self.finish(json.dumps({"events": []}))

    @web.authenticated
    def get(self):
        self.set_header("Content-Type", "application/json")
        self.finish(json.dumps({"events": self.capture}))


def _jupyter_server_extension_points():
    return [{"module": "event_capture_extension"}]


def _load_jupyter_server_extension(app):
    captured = []
    prefix = "https://schema.notebook.link/metrics"

    async def listener(logger, schema_id, data):
        captured.append({"data": data, "schema_id": schema_id})

    for schema in schemas:
        app.event_logger.add_listener(
            listener=listener,
            schema_id=f"{prefix}/{schema}/v1",
        )

    app.web_app.settings["notebook_link_metrics_capture"] = captured
    route = url_path_join(app.base_url, "api", "metrics-capture")
    app.web_app.add_handlers(".*$", [(route, MetricsCaptureHandler)])
