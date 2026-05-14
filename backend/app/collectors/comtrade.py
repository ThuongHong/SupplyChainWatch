from __future__ import annotations

from datetime import date
from typing import Any

from app.collectors.base import BaseCollector, CollectorError
from app.config import get_settings
from app.schemas.records import TradeFlowRecord


class ComtradeCollector(BaseCollector[TradeFlowRecord]):
    """Collect monthly trade flows from UN Comtrade."""

    source = "un_comtrade"
    record_model = TradeFlowRecord

    def collect(self) -> list[dict[str, Any]]:
        settings = get_settings()
        if not settings.un_comtrade_api_key:
            raise CollectorError("UN_COMTRADE_API_KEY is required")

        payload = self.request_json(
            "GET",
            "https://comtradeapi.un.org/data/v1/get/C/M/HS",
            headers={"Ocp-Apim-Subscription-Key": settings.un_comtrade_api_key},
            params={"reporterCode": "156", "partnerCode": "842", "cmdCode": "TOTAL"},
        )
        rows: list[dict[str, Any]] = []
        for item in payload.get("data", []):
            period = str(item.get("period"))
            rows.append(
                {
                    "time": date(int(period[:4]), int(period[4:6]), 1),
                    "reporter_code": str(item.get("reporterCode")),
                    "partner_code": str(item.get("partnerCode")),
                    "commodity_code": str(item.get("cmdCode")),
                    "flow": str(item.get("flowDesc", "")).lower(),
                    "value_usd": _optional_float(item.get("primaryValue")),
                    "weight_kg": _optional_float(item.get("netWgt")),
                }
            )
        return rows


def _optional_float(value: Any) -> float | None:
    return None if value in (None, "") else float(value)
