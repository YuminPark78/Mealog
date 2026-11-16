"""Run the API and glucose worker together on one Render service."""

import logging
import os
import signal
import subprocess
import sys
import time

logger = logging.getLogger(__name__)
stopping = False


def request_shutdown(signum, frame):
    global stopping
    stopping = True


def stop_children(children):
    # Uvicorn handles SIGTERM. The current worker handles KeyboardInterrupt,
    # so send its process group SIGINT.
    for name, process in children:
        shutdown_signal = (
            signal.SIGINT if name == "glucose-worker" else signal.SIGTERM
        )
        try:
            os.killpg(process.pid, shutdown_signal)
        except ProcessLookupError:
            pass

    # Leave time before Render's default 30-second forced shutdown.
    deadline = time.monotonic() + 20

    for name, process in children:
        remaining = max(0, deadline - time.monotonic())
        try:
            process.wait(timeout=remaining)
        except subprocess.TimeoutExpired:
            logger.warning("Force-stopping %s", name)
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait()


def main():
    global stopping
    stopping = False

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    signal.signal(signal.SIGTERM, request_shutdown)
    signal.signal(signal.SIGINT, request_shutdown)

    # Fail early if required settings or the encryption key are invalid.
    from mealog_api.config import settings
    from mealog_api.collector_config import CollectorSettings, credential_cipher

    CollectorSettings()
    credential_cipher()

    port = os.environ.get("PORT", "8000")

    commands = [
        (
            "api",
            [
                sys.executable,
                "-m",
                "uvicorn",
                "mealog_api.main:app",
                "--host",
                "0.0.0.0",
                "--port",
                port,
                "--workers",
                "1",
            ],
        ),
        (
            "glucose-worker",
            [
                sys.executable,
                "-u",
                "-m",
                "mealog_api.jobs.glucose_worker",
            ],
        ),
    ]

    children = []
    exit_code = 0

    try:
        for name, command in commands:
            if stopping:
                break

            process = subprocess.Popen(
                command,
                start_new_session=True,
            )
            children.append((name, process))
            logger.info("Started %s", name)

        while not stopping:
            for name, process in children:
                return_code = process.poll()
                if return_code is not None:
                    logger.error(
                        "%s exited unexpectedly with code %s",
                        name,
                        return_code,
                    )
                    exit_code = 1
                    stopping = True
                    break

            if not stopping:
                time.sleep(0.5)

    finally:
        stop_children(children)

    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())