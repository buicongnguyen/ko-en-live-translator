from __future__ import annotations

import subprocess
from dataclasses import dataclass
from typing import Any

from .config import Settings


@dataclass(frozen=True, slots=True)
class GpuStatus:
    available: bool
    safe: bool
    temperature_c: int | None = None
    max_temperature_c: int | None = None
    utilization_percent: int | None = None
    memory_used_mb: int | None = None
    memory_total_mb: int | None = None
    power_draw_w: float | None = None
    power_limit_w: float | None = None
    message: str = ""

    def public_dict(self) -> dict[str, Any]:
        return {
            "available": self.available,
            "safe": self.safe,
            "temperature_c": self.temperature_c,
            "max_temperature_c": self.max_temperature_c,
            "utilization_percent": self.utilization_percent,
            "memory_used_mb": self.memory_used_mb,
            "memory_total_mb": self.memory_total_mb,
            "power_draw_w": self.power_draw_w,
            "power_limit_w": self.power_limit_w,
            "message": self.message,
        }


class GpuMonitor:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def snapshot(self) -> GpuStatus:
        if not self.settings.gpu_status_enabled:
            return GpuStatus(
                available=False,
                safe=True,
                max_temperature_c=self.settings.gpu_max_temperature_c,
                message="GPU status monitoring is disabled.",
            )

        try:
            completed = subprocess.run(
                [
                    self.settings.nvidia_smi_path,
                    "--query-gpu=temperature.gpu,utilization.gpu,memory.used,memory.total,power.draw,power.limit",
                    "--format=csv,noheader,nounits",
                ],
                capture_output=True,
                check=True,
                text=True,
                timeout=3,
            )
        except Exception as exc:
            return GpuStatus(
                available=False,
                safe=True,
                max_temperature_c=self.settings.gpu_max_temperature_c,
                message=f"GPU status unavailable from nvidia-smi: {exc}",
            )

        line = completed.stdout.strip().splitlines()[0] if completed.stdout.strip() else ""
        values = [value.strip() for value in line.split(",")]
        temperature_c = _parse_int(values, 0)
        utilization_percent = _parse_int(values, 1)
        memory_used_mb = _parse_int(values, 2)
        memory_total_mb = _parse_int(values, 3)
        power_draw_w = _parse_float(values, 4)
        power_limit_w = _parse_float(values, 5)
        safe = (
            temperature_c is None
            or temperature_c < self.settings.gpu_max_temperature_c
        )
        message = (
            "GPU temperature is inside the configured safety limit."
            if safe
            else (
                f"GPU is {temperature_c}C, above the "
                f"{self.settings.gpu_max_temperature_c}C safety limit."
            )
        )
        return GpuStatus(
            available=True,
            safe=safe,
            temperature_c=temperature_c,
            max_temperature_c=self.settings.gpu_max_temperature_c,
            utilization_percent=utilization_percent,
            memory_used_mb=memory_used_mb,
            memory_total_mb=memory_total_mb,
            power_draw_w=power_draw_w,
            power_limit_w=power_limit_w,
            message=message,
        )


def _parse_int(values: list[str], index: int) -> int | None:
    if index >= len(values):
        return None
    try:
        return int(float(values[index]))
    except ValueError:
        return None


def _parse_float(values: list[str], index: int) -> float | None:
    if index >= len(values):
        return None
    try:
        return round(float(values[index]), 1)
    except ValueError:
        return None
