from typing import Sequence

import pytest

from sentry.testutils.helpers.options import override_options
from sentry.utils.sdk_crashes.sdk_crash_detection_config import (
    SDKCrashDetectionConfig,
    build_sdk_crash_detection_configs,
)


@pytest.fixture
def store_event(default_project, factories):
    def inner(data):
        return factories.store_event(data=data, project_id=default_project.id)

    return inner


@pytest.fixture
def sdk_crash_detection_configs() -> Sequence[SDKCrashDetectionConfig]:
    @override_options(
        {
            "issues.sdk_crash_detection.cocoa.project_id": 1234,
            "issues.sdk_crash_detection.cocoa.sample_rate": 1.0,
            "issues.sdk_crash_detection.react-native.project_id": 2,
            "issues.sdk_crash_detection.react-native.sample_rate": 0.2,
            "issues.sdk_crash_detection.react-native.organization_allowlist": [1],
        }
    )
    def inner() -> Sequence[SDKCrashDetectionConfig]:
        return build_sdk_crash_detection_configs()

    return inner
