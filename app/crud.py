from sqlalchemy.orm import Session
from app import models

def create_assessment(db: Session, company_name, sector, size):
    company = models.Company(name=company_name, sector=sector, size=size)
    db.add(company)
    db.commit()
    db.refresh(company)

    assessment = models.Assessment(company_id=company.id)
    db.add(assessment)
    db.commit()
    db.refresh(assessment)

    # clone criteria
    criteria = db.query(models.Criterion).all()
    for c in criteria:
        db.add(models.AssessmentCriterion(
            assessment_id=assessment.id,
            criterion_id=c.id
        ))
    db.commit()

    return assessment

def get_assessment_criteria(db: Session, assessment_id):
    return db.query(models.AssessmentCriterion).all()

def get_messages(db: Session, assessment_id):
    return db.query(models.Message).filter_by(assessment_id=assessment_id).all()

def save_message(db: Session, assessment_id, role, content):
    msg = models.Message(
        assessment_id=assessment_id,
        role=role,
        content=content
    )
    db.add(msg)
    db.commit()