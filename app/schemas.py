from pydantic import BaseModel

class StartRequest(BaseModel):
    company_name: str
    sector: str
    size: str

class AnswerRequest(BaseModel):
    answer: str