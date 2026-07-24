"""Covers the saved-report endpoints' filename handling.

The report name is chosen by the browser and interpolated straight into a filesystem path,
so it is the one untrusted string that reaches `os.remove`. These lock the guard in place.
"""

from __future__ import annotations

import os

import pytest
from fastapi import HTTPException

from app.api.routes.scraping import _resolve_report_path


def test_a_normal_report_name_resolves_inside_the_reports_directory():
    path = _resolve_report_path("mytek_report_20260721_215723.json")
    assert os.path.dirname(path) == os.path.abspath("scraped_data")
    assert path.endswith("mytek_report_20260721_215723.json")


@pytest.mark.parametrize(
    "attack",
    [
        "../../../etc/passwd",
        "../../app/main.py",
        "..\\..\\app\\core\\config.py",
        "/etc/shadow",
        "C:\\Windows\\System32\\config\\SAM",
        "....//....//secrets.json",
    ],
)
def test_traversal_attempts_are_rejected(attack):
    """Either the name is not a report file, or it never escapes the directory."""
    with pytest.raises(HTTPException) as excinfo:
        _resolve_report_path(attack)
    assert excinfo.value.status_code == 400


def test_a_traversal_disguised_as_a_report_name_still_cannot_escape():
    """basename() strips the path, so this lands harmlessly inside scraped_data."""
    path = _resolve_report_path("../../x_report_1.json")
    assert os.path.dirname(path) == os.path.abspath("scraped_data")


@pytest.mark.parametrize(
    "name",
    ["notes.txt", "report.json", "mytek_report_1.json.exe", "", "database.json"],
)
def test_files_that_are_not_saved_reports_are_rejected(name):
    """The endpoints must not become a generic file reader or deleter."""
    with pytest.raises(HTTPException) as excinfo:
        _resolve_report_path(name)
    assert excinfo.value.status_code == 400
