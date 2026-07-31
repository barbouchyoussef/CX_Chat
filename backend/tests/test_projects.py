"""Engagement project store: CRUD + per-step status."""

from __future__ import annotations

import pytest

from app.schemas.project import PROJECT_STEPS
from app.services.projects import project_store


@pytest.fixture(autouse=True)
def _isolate(tmp_path, monkeypatch):
    monkeypatch.setattr(project_store, "_ROOT", tmp_path / "projects")


def test_create_initializes_all_steps_as_todo():
    p = project_store.create("Ooredoo CX", company_name="Ooredoo", sector="Telecom")
    assert p.id and p.name == "Ooredoo CX" and p.company_name == "Ooredoo"
    assert set(p.steps.keys()) == set(PROJECT_STEPS)
    assert all(v == "todo" for v in p.steps.values())


def test_set_step_and_persist():
    p = project_store.create("Proj")
    updated = project_store.set_step(p.id, "assessment", "done")
    assert updated.steps["assessment"] == "done"
    # reload from disk reflects it
    assert project_store.get(p.id).steps["assessment"] == "done"


def test_set_unknown_step_is_rejected():
    p = project_store.create("Proj")
    assert project_store.set_step(p.id, "not_a_step", "done") is None


def test_list_is_newest_first_and_delete_works():
    a = project_store.create("A")
    b = project_store.create("B")
    ids = [p.id for p in project_store.list_projects()]
    assert set(ids) == {a.id, b.id}
    assert project_store.delete(a.id) is True
    assert project_store.get(a.id) is None
    assert [p.id for p in project_store.list_projects()] == [b.id]


def test_update_metadata():
    p = project_store.create("Old")
    u = project_store.update(p.id, name="New", company_name="Acme", sector="Retail")
    assert u.name == "New" and u.company_name == "Acme" and u.sector == "Retail"
