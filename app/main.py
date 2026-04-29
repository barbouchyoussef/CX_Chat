import os
from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session
from app.db import SessionLocal, engine, Base
from app import models, schemas, crud
from app.services import engine as eng, llm

os.environ["PYTHONUTF8"] = "1"

app = FastAPI()

Base.metadata.create_all(bind=engine)

# ---------------- DB Dependency ----------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------- START ----------------
@app.post("/assessments/start")
def start(req: schemas.StartRequest, db: Session = Depends(get_db)):
    assessment = crud.create_assessment(
        db,
        req.company_name,
        req.sector,
        req.size
    )
    return {"assessment_id": assessment.id}


# ---------------- NEXT QUESTION ----------------
@app.get("/assessments/{id}/next")
def next_question(id: int, db: Session = Depends(get_db)):
    grouped = eng.group_by_axis(db, id)
    axis = eng.get_current_axis(grouped)

    if axis is None:
        return {"message": "Assessment completed"}

    missing = [c["label"] for c in grouped[axis] if not c["covered"]]

    history = crud.get_messages(db, id)

    question = llm.generate_question(axis, missing, history, "unknown")

    crud.save_message(db, id, "assistant", question)

    return {"axis": axis, "question": question}


# ---------------- ANSWER ----------------
@app.post("/assessments/{id}/answer")
def answer(id: int, req: schemas.AnswerRequest, db: Session = Depends(get_db)):
    crud.save_message(db, id, "user", req.answer)

    grouped = eng.group_by_axis(db, id)
    axis = eng.get_current_axis(grouped)

    if axis is None:
        return {"status": "completed"}

    criteria = grouped[axis]

    coverage = llm.detect_coverage(req.answer, criteria)

    for cid in coverage["covered"]:
        db.query(models.AssessmentCriterion).filter_by(
            assessment_id=id,
            criterion_id=cid
        ).update({"covered": True, "confidence": coverage["confidence"]})

    db.commit()

    return {"status": "ok", "covered": coverage["covered"]}