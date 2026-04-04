import asyncio
from datetime import datetime, timezone

from notebook_link_metrics import schemas


COMMAND_EXECUTED = "https://schema.notebook.link/metrics/command-executed/v1"


async def _wait(predicate, timeout=1):
    async with asyncio.timeout(timeout):
        while not predicate():
            await asyncio.sleep(0)


async def test_registers_metric_schemas(jp_serverapp):
    expected = {
        f"https://schema.notebook.link/metrics/{schema}/v1"
        for schema in schemas
    }

    assert expected.issubset(set(jp_serverapp.event_logger.schemas.schema_ids))


async def test_backend_listeners_can_collect_metrics(jp_serverapp):
    captured = []

    async def listener(logger, schema_id, data):
        captured.append({"data": data, "schema_id": schema_id})

    payload = {
        "level": {"anonymous": False, "sensitivity": "high"},
        "metrics": {"command": "metrics:test", "label": "Metrics Test"},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    jp_serverapp.event_logger.add_listener(
        listener=listener,
        schema_id=COMMAND_EXECUTED,
    )

    capsule = jp_serverapp.event_logger.emit(
        schema_id=COMMAND_EXECUTED,
        data=payload,
    )

    assert capsule is not None
    await _wait(lambda: len(captured) == 1)
    assert captured[0]["schema_id"] == COMMAND_EXECUTED
    assert captured[0]["data"]["metrics"]["command"] == "metrics:test"
