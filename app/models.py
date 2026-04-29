from sqlalchemy import Column, Integer, String, ForeignKey, Boolean, Float, Text
from app.db import Base



class Company(Base):
    __tablename__ = "companies"
    id = Column(Integer, primary_key=True)
    name = Column(String)
    sector = Column(String)
    size = Column(String)


class Assessment(Base):
    __tablename__ = "assessments"
    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"))
    status = Column(String)


class Axis(Base):
    __tablename__ = "axes"
    id = Column(Integer, primary_key=True)
    name = Column(String)


class Criterion(Base):
    __tablename__ = "criteria"
    id = Column(Integer, primary_key=True)
    axis_id = Column(Integer, ForeignKey("axes.id"))
    code = Column(String)
    label = Column(String)


class AssessmentCriterion(Base):
    __tablename__ = "assessment_criteria"
    id = Column(Integer, primary_key=True)
    assessment_id = Column(Integer)
    criterion_id = Column(Integer)
    covered = Column(Boolean, default=False)
    confidence = Column(Float, default=0)


class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True)
    assessment_id = Column(Integer)
    role = Column(String)
    content = Column(Text)