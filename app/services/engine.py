from app import models

AXES_ORDER = ["Manage", "Analyze", "Maintain"]

def group_by_axis(db, assessment_id):
    result = {}
    for axis in AXES_ORDER:
        result[axis] = []

    criteria = db.query(models.Criterion).all()
    statuses = db.query(models.AssessmentCriterion).filter_by(
        assessment_id=assessment_id
    ).all()

    status_map = {s.criterion_id: s for s in statuses}

    for c in criteria:
        axis_name = db.query(models.Axis).get(c.axis_id).name
        result[axis_name].append({
            "id": c.id,
            "label": c.label,
            "covered": status_map[c.id].covered
        })

    return result


def get_current_axis(grouped):
    for axis in AXES_ORDER:
        if not all(c["covered"] for c in grouped[axis]):
            return axis
    return None